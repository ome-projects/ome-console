package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

const (
	defaultTailLines = 500
	maxTailLines     = 10000
	// defaultLogLimitBytes caps what a one-shot (non-follow) read requests per pod.
	defaultLogLimitBytes = 2 << 20
	// maxFollowDuration bounds a followed stream; the client reconnects for more.
	maxFollowDuration = 10 * time.Minute
	logWriteTimeout   = 30 * time.Second
	// maxLogLineBytes is the longest log line passed on whole; the rest of a longer line is dropped.
	maxLogLineBytes = 1 << 20
	// limitSlack is how far below LimitBytes a read may stop and still count as having hit the
	// limit: the kubelet returns slightly more or less than asked.
	limitSlack = 4096
)

// revisionHashPattern matches the hash in a revision name (<isvc>-<component>-rev-<hash>) and in
// the ome.io/revision-hash pod label.
var revisionHashPattern = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

// LogsHandler streams pod logs of an InferenceService as newline-delimited JSON.
type LogsHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

// NewLogsHandler creates a LogsHandler.
func NewLogsHandler(k8sClient *k8s.Client, logger *zap.Logger) *LogsHandler {
	return &LogsHandler{k8sClient: k8sClient, logger: logger}
}

// logLine is one line of output, as NDJSON. Partial marks a line that ended without a newline:
// the last line of a read that hit the byte limit, or a line longer than maxLogLineBytes.
type logLine struct {
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Timestamp string `json:"ts,omitempty"`
	Line      string `json:"line"`
	Partial   bool   `json:"partial,omitempty"`
}

// logNotice is an out-of-band message in the same stream: truncation or a pod whose logs could
// not be read.
type logNotice struct {
	Pod    string `json:"pod,omitempty"`
	Notice string `json:"notice"`
}

// Stream handles GET /api/v1/namespaces/:namespace/services/:name/logs. Query parameters:
// component, instance (OMENative instance index), revision (revision name or hash), container
// (default: ome-container, else the pod's first container), tailLines (default 500),
// follow=true (bounded to 10 minutes). Pods are selected exactly as `kubectl ome logs` does,
// at most 20 of them.
func (h *LogsHandler) Stream(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")
	name := c.Param("name")

	sel := k8s.PodSelector{Service: name, Component: c.Query("component")}
	if v := c.Query("instance"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 {
			writeBadRequest(c, h.logger, "Invalid logs request", errors.New("instance must be a non-negative integer"))
			return
		}
		sel.Instance = &n
	}
	if v := c.Query("revision"); v != "" {
		hash, ok := revisionHash(v)
		if !ok {
			writeBadRequest(c, h.logger, "Invalid logs request", errors.New("revision must be a revision name or its hash"))
			return
		}
		sel.Revision = hash
	}
	tail := int64(defaultTailLines)
	if v := c.Query("tailLines"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 || n > maxTailLines {
			writeBadRequest(c, h.logger, "Invalid logs request", errors.New("tailLines must be between 0 and "+strconv.Itoa(maxTailLines)))
			return
		}
		tail = n
	}
	follow := c.Query("follow") == "true"
	container := c.Query("container")

	pods, truncated, err := h.k8sClient.ListServicePods(ctx, namespace, sel, k8s.MaxLogPods)
	if err != nil {
		writeError(c, h.logger, "Failed to list pods", err)
		return
	}
	if len(pods) == 0 {
		writeError(c, h.logger, "No pods found for the service", apierrors.NewNotFound(corev1.Resource("pods"), name))
		return
	}

	streamCtx := ctx
	cancel := func() {}
	if follow {
		streamCtx, cancel = context.WithTimeout(ctx, maxFollowDuration)
	}
	defer cancel()

	lines := make(chan []byte, 64)
	var wg sync.WaitGroup
	for i := range pods {
		pod := &pods[i]
		opts := &corev1.PodLogOptions{
			Container:  containerFor(pod, container),
			Follow:     follow,
			Timestamps: true,
			TailLines:  &tail,
		}
		if !follow {
			limit := int64(defaultLogLimitBytes)
			opts.LimitBytes = &limit
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			h.pump(streamCtx, namespace, pod.Name, opts, lines)
		}()
	}
	go func() {
		wg.Wait()
		close(lines)
	}()

	c.Writer.Header().Set("Content-Type", "application/x-ndjson")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	controller := http.NewResponseController(c.Writer)
	write := func(b []byte) bool {
		if err := controller.SetWriteDeadline(time.Now().Add(logWriteTimeout)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			h.logger.Debug("Could not set log write deadline", zap.Error(err))
		}
		if _, err := c.Writer.Write(append(b, '\n')); err != nil {
			return false
		}
		c.Writer.Flush()
		return true
	}

	if truncated {
		write(marshalNotice(logNotice{Notice: "showing the first " + strconv.Itoa(k8s.MaxLogPods) +
			" pods; narrow the request with component, instance or revision"}))
	}
	for {
		select {
		case b, ok := <-lines:
			if !ok {
				return
			}
			if !write(b) {
				cancel()
				return
			}
		case <-ctx.Done():
			cancel()
			return
		}
	}
}

// pump copies one pod's log stream into lines as JSON until the stream ends or ctx is done.
func (h *LogsHandler) pump(ctx context.Context, namespace, pod string, opts *corev1.PodLogOptions, lines chan<- []byte) {
	send := func(b []byte) bool {
		select {
		case lines <- b:
			return true
		case <-ctx.Done():
			return false
		}
	}

	rc, err := h.k8sClient.StreamPodLogs(ctx, namespace, pod, opts)
	if err != nil {
		send(marshalNotice(logNotice{Pod: pod, Notice: "cannot read logs: " + err.Error()}))
		return
	}
	defer rc.Close()

	var limit int64
	if opts.LimitBytes != nil {
		limit = *opts.LimitBytes
	}
	copyLogLines(ctx, rc, pod, opts.Container, limit, send)
}

// copyLogLines turns the raw log stream into one JSON record per line. A final line without a
// newline is passed on marked partial; when the read also stopped at the byte limit, a notice
// says so, because the kubelet cuts the stream mid-line there.
func copyLogLines(ctx context.Context, r io.Reader, pod, container string, limit int64, send func([]byte) bool) {
	reader := bufio.NewReaderSize(r, 64*1024)
	var read int64
	for {
		line, complete, consumed, err := readLogLine(reader, maxLogLineBytes)
		read += consumed
		if len(line) > 0 || complete {
			ts, text := splitLogTimestamp(string(line))
			b, merr := json.Marshal(logLine{Pod: pod, Container: container, Timestamp: ts, Line: text, Partial: !complete})
			if merr == nil && !send(b) {
				return
			}
		}
		if err == nil {
			continue
		}
		if !errors.Is(err, io.EOF) {
			if ctx.Err() == nil {
				send(marshalNotice(logNotice{Pod: pod, Notice: "log stream ended: " + err.Error()}))
			}
			return
		}
		if !complete && len(line) > 0 && limit > 0 && read >= limit-limitSlack {
			send(marshalNotice(logNotice{Pod: pod, Notice: fmt.Sprintf(
				"output cut at the %d MiB per-pod limit; the last line is partial, use tailLines to narrow", limit>>20)}))
		}
		return
	}
}

// readLogLine reads one line without its newline. complete is false when the input ended before
// a newline, or when the line's content exceeded max bytes: the first max bytes are returned and
// the rest of the line is dropped. consumed counts every byte taken from the reader, the newline
// and dropped bytes included, so callers can compare it with the kubelet's byte limit. err is
// io.EOF once the input is exhausted.
func readLogLine(r *bufio.Reader, max int) (line []byte, complete bool, consumed int64, err error) {
	cut := false
	for {
		chunk, rerr := r.ReadSlice('\n')
		consumed += int64(len(chunk))
		if rerr == nil {
			chunk = chunk[:len(chunk)-1] // the newline is not part of the content
		}
		if !cut {
			line = append(line, chunk...)
			if len(line) > max {
				line = line[:max]
				cut = true
			}
		}
		switch {
		case rerr == nil:
			return line, !cut, consumed, nil
		case errors.Is(rerr, bufio.ErrBufferFull):
			continue
		default:
			return line, false, consumed, rerr
		}
	}
}

// containerFor picks the container to read: the requested one, else ome-container, else the
// pod's first container.
func containerFor(pod *corev1.Pod, requested string) string {
	if requested != "" {
		return requested
	}
	for _, ctr := range pod.Spec.Containers {
		if ctr.Name == k8s.MainContainerName {
			return ctr.Name
		}
	}
	if len(pod.Spec.Containers) > 0 {
		return pod.Spec.Containers[0].Name
	}
	return ""
}

// revisionHash accepts a revision name such as llama-engine-rev-a1b2c3d4 or the bare hash and
// returns the hash the pod label carries.
func revisionHash(revision string) (string, bool) {
	hash := revision
	if i := strings.LastIndex(revision, "-rev-"); i >= 0 {
		hash = revision[i+len("-rev-"):]
	}
	if hash == "" || len(hash) > 63 || !revisionHashPattern.MatchString(hash) {
		return "", false
	}
	return hash, true
}

// splitLogTimestamp separates the RFC3339 timestamp the kubelet prefixes when Timestamps is set.
func splitLogTimestamp(line string) (string, string) {
	ts, rest, ok := strings.Cut(line, " ")
	if !ok {
		return "", line
	}
	if _, err := time.Parse(time.RFC3339Nano, ts); err != nil {
		return "", line
	}
	return ts, rest
}

func marshalNotice(n logNotice) []byte {
	b, _ := json.Marshal(n)
	return b
}
