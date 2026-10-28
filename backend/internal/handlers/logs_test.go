package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

func newLogsRouter(t *testing.T, podCount int) (http.Handler, *k8s.Client) {
	t.Helper()
	client, _ := newStartedClient(t, nil)
	cs := client.Clientset.(*k8sfake.Clientset)
	for i := 0; i < podCount; i++ {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      fmt.Sprintf("llama-engine-%02d", i),
				Namespace: "team-a",
				Labels:    map[string]string{k8s.InferenceServiceLabel: "llama", k8s.ComponentLabel: "engine"},
			},
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "sidecar"}, {Name: k8s.MainContainerName}}},
		}
		if _, err := cs.CoreV1().Pods("team-a").Create(context.Background(), pod, metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	router, v1 := newRouter()
	v1.GET("/namespaces/:namespace/services/:name/logs", NewLogsHandler(client, zaptest.NewLogger(t)).Stream)
	return router, client
}

type streamedLine struct {
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Line      string `json:"line"`
	Notice    string `json:"notice"`
}

func readLines(t *testing.T, body string) []streamedLine {
	t.Helper()
	var lines []streamedLine
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		var l streamedLine
		if err := json.Unmarshal(scanner.Bytes(), &l); err != nil {
			t.Fatalf("line %q is not JSON: %v", scanner.Text(), err)
		}
		lines = append(lines, l)
	}
	return lines
}

func TestLogsStream_OneLinePerPodLine(t *testing.T) {
	router, _ := newLogsRouter(t, 2)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/logs", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/x-ndjson" {
		t.Fatalf("content type %q", ct)
	}

	lines := readLines(t, w.Body.String())
	if len(lines) != 2 {
		t.Fatalf("got %d lines, want one per pod: %+v", len(lines), lines)
	}
	seen := map[string]bool{}
	for _, l := range lines {
		// The fake clientset answers every log request with "fake logs".
		if l.Line != "fake logs" || l.Container != k8s.MainContainerName {
			t.Fatalf("unexpected line %+v", l)
		}
		seen[l.Pod] = true
	}
	if !seen["llama-engine-00"] || !seen["llama-engine-01"] {
		t.Fatalf("pods missing from the stream: %+v", lines)
	}
}

func TestLogsStream_LimitsPodsWithNotice(t *testing.T) {
	router, _ := newLogsRouter(t, k8s.MaxLogPods+5)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/logs", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	lines := readLines(t, w.Body.String())
	if len(lines) != k8s.MaxLogPods+1 || !strings.Contains(lines[0].Notice, "first 20 pods") {
		t.Fatalf("want a notice then %d lines, got %d: first=%+v", k8s.MaxLogPods, len(lines), lines[0])
	}
}

func TestLogsStream_NoPodsIs404(t *testing.T) {
	router, _ := newLogsRouter(t, 2)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/logs?component=router", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404: %s", w.Code, w.Body.String())
	}
}

func TestLogsStream_RejectsBadParameters(t *testing.T) {
	router, _ := newLogsRouter(t, 1)
	for _, query := range []string{"?instance=abc", "?instance=-1", "?revision=BAD_REV", "?tailLines=-1", "?tailLines=99999"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/logs"+query, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("query %q: status %d, want 400", query, w.Code)
		}
	}
}

func TestRevisionHash(t *testing.T) {
	cases := map[string]struct {
		in   string
		want string
		ok   bool
	}{
		"bare hash":     {"a1b2c3d4", "a1b2c3d4", true},
		"revision name": {"llama-engine-rev-a1b2c3d4", "a1b2c3d4", true},
		"uppercase":     {"A1B2C3D4", "", false},
		"empty hash":    {"llama-engine-rev-", "", false},
		"underscore":    {"bad_rev", "", false},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, ok := revisionHash(tc.in)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("revisionHash(%q) = %q, %v; want %q, %v", tc.in, got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestSplitLogTimestamp(t *testing.T) {
	ts, line := splitLogTimestamp("2026-10-26T12:00:00.123456789Z INFO ready")
	if ts != "2026-10-26T12:00:00.123456789Z" || line != "INFO ready" {
		t.Fatalf("got %q, %q", ts, line)
	}
	ts, line = splitLogTimestamp("no timestamp here")
	if ts != "" || line != "no timestamp here" {
		t.Fatalf("got %q, %q", ts, line)
	}
}

func TestContainerFor(t *testing.T) {
	pod := &corev1.Pod{Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "sidecar"}, {Name: k8s.MainContainerName}}}}
	if got := containerFor(pod, ""); got != k8s.MainContainerName {
		t.Fatalf("default container %q", got)
	}
	if got := containerFor(pod, "sidecar"); got != "sidecar" {
		t.Fatalf("requested container %q", got)
	}
	first := &corev1.Pod{Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "only"}}}}
	if got := containerFor(first, ""); got != "only" {
		t.Fatalf("fallback container %q", got)
	}
}

func TestReadLogLine(t *testing.T) {
	r := bufio.NewReaderSize(strings.NewReader("first\nsecond"), 16)
	line, complete, consumed, err := readLogLine(r, 1024)
	if string(line) != "first" || !complete || consumed != 6 || err != nil {
		t.Fatalf("first: %q %v %d %v", line, complete, consumed, err)
	}
	line, complete, consumed, err = readLogLine(r, 1024)
	if string(line) != "second" || complete || consumed != 6 || err != io.EOF {
		t.Fatalf("partial last line: %q %v %d %v", line, complete, consumed, err)
	}

	// A line of exactly max content bytes is complete; the newline does not count.
	r = bufio.NewReaderSize(strings.NewReader("0123456789\n"), 16)
	line, complete, consumed, err = readLogLine(r, 10)
	if string(line) != "0123456789" || !complete || consumed != 11 || err != nil {
		t.Fatalf("exact-max line: %q %v %d %v", line, complete, consumed, err)
	}

	// A longer line is cut at max; the dropped remainder still counts as consumed.
	long := strings.Repeat("x", 40) + "\nafter\n"
	r = bufio.NewReaderSize(strings.NewReader(long), 16)
	line, complete, consumed, err = readLogLine(r, 10)
	if string(line) != strings.Repeat("x", 10) || complete || consumed != 41 || err != nil {
		t.Fatalf("cut line: %q %v %d %v", line, complete, consumed, err)
	}
	line, complete, consumed, err = readLogLine(r, 10)
	if string(line) != "after" || !complete || consumed != 6 || err != nil {
		t.Fatalf("line after the cut one: %q %v %d %v", line, complete, consumed, err)
	}
}

func TestCopyLogLines_LimitNoticeCountsDroppedBytes(t *testing.T) {
	// One line longer than maxLogLineBytes, cut by the kubelet at the byte limit: the dropped
	// part must count towards the limit so the notice is still raised.
	limit := int64(maxLogLineBytes + 4096)
	body := strings.Repeat("y", int(limit))
	lines := collectLines(t, body, limit)
	if len(lines) != 2 || !strings.Contains(lines[1].Notice, "cut at the") {
		t.Fatalf("want the cut line and a limit notice, got %+v", lines)
	}
}

func collectLines(t *testing.T, input string, limit int64) []streamedLine {
	t.Helper()
	var out []streamedLine
	copyLogLines(context.Background(), strings.NewReader(input), "p0", "ome-container", limit, func(b []byte) bool {
		var l streamedLine
		if err := json.Unmarshal(b, &l); err != nil {
			t.Fatal(err)
		}
		out = append(out, l)
		return true
	})
	return out
}

func TestCopyLogLines_PartialLastLineAndLimitNotice(t *testing.T) {
	type partialLine struct {
		Line    string `json:"line"`
		Partial bool   `json:"partial"`
	}
	complete := collectLines(t, "2026-10-26T12:00:00Z a\n2026-10-26T12:00:01Z b\n", 1<<20)
	if len(complete) != 2 || complete[1].Line != "b" || complete[1].Notice != "" {
		t.Fatalf("complete lines: %+v", complete)
	}

	// A short read that ends without a newline: the line is partial, but nowhere near the
	// limit, so there is no truncation notice.
	short := collectLines(t, "a\nb", 1<<20)
	if len(short) != 2 || short[1].Line != "b" || short[1].Notice != "" {
		t.Fatalf("short read: %+v", short)
	}
	var raw []byte
	copyLogLines(context.Background(), strings.NewReader("a\nb"), "p0", "c", 1<<20, func(b []byte) bool { raw = b; return true })
	var last partialLine
	if err := json.Unmarshal(raw, &last); err != nil || !last.Partial {
		t.Fatalf("last line not marked partial: %s", raw)
	}

	// A read cut by the byte limit: the partial line is followed by a notice.
	limit := int64(1 << 20)
	body := strings.Repeat("line\n", int(limit/5)) + "cut-mid"
	cut := collectLines(t, body, limit)
	if last := cut[len(cut)-1]; !strings.Contains(last.Notice, "cut at the 1 MiB") {
		t.Fatalf("expected a limit notice, got %+v", last)
	}
	if prev := cut[len(cut)-2]; prev.Line != "cut-mid" {
		t.Fatalf("expected the partial line before the notice, got %+v", prev)
	}
}
