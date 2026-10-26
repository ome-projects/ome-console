package handlers

import (
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// ObjectEventsHandler serves the Kubernetes events recorded for one object.
type ObjectEventsHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

// NewObjectEventsHandler creates an ObjectEventsHandler.
func NewObjectEventsHandler(k8sClient *k8s.Client, logger *zap.Logger) *ObjectEventsHandler {
	return &ObjectEventsHandler{k8sClient: k8sClient, logger: logger}
}

// List handles GET /api/v1/namespaces/:namespace/events?kind=InferenceService&name=llama
func (h *ObjectEventsHandler) List(c *gin.Context) {
	namespace := c.Param("namespace")
	kind := c.Query("kind")
	name := c.Query("name")
	if kind == "" || name == "" {
		writeBadRequest(c, h.logger, "Invalid events request", errors.New("kind and name query parameters are required"))
		return
	}

	list, err := h.k8sClient.ListObjectEvents(c.Request.Context(), namespace, kind, name)
	if err != nil {
		writeError(c, h.logger, "Failed to list events", err)
		return
	}

	events := toObjectEvents(list.Items)
	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  len(events),
	})
}

// toObjectEvents converts core events to the console's shape, most recently seen first. Events
// recorded through the events.k8s.io API carry eventTime and a series instead of the legacy
// timestamps and count, so both forms are read.
func toObjectEvents(items []corev1.Event) []ModelEvent {
	out := make([]ModelEvent, 0, len(items))
	for i := range items {
		e := &items[i]
		out = append(out, ModelEvent{
			Type:           e.Type,
			Reason:         e.Reason,
			Message:        e.Message,
			Count:          eventCount(e),
			FirstTimestamp: formatEventTime(eventFirstSeen(e)),
			LastTimestamp:  formatEventTime(eventLastSeen(e)),
			Source:         eventSource(e),
		})
	}
	// Timestamps are RFC3339 in UTC, so string order is time order.
	sort.SliceStable(out, func(i, j int) bool { return out[i].LastTimestamp > out[j].LastTimestamp })
	return out
}

func eventFirstSeen(e *corev1.Event) time.Time {
	if !e.FirstTimestamp.IsZero() {
		return e.FirstTimestamp.Time
	}
	return e.EventTime.Time
}

func eventLastSeen(e *corev1.Event) time.Time {
	switch {
	case !e.LastTimestamp.IsZero():
		return e.LastTimestamp.Time
	case e.Series != nil && !e.Series.LastObservedTime.IsZero():
		return e.Series.LastObservedTime.Time
	case !e.EventTime.IsZero():
		return e.EventTime.Time
	default:
		return e.FirstTimestamp.Time
	}
}

func eventCount(e *corev1.Event) int32 {
	switch {
	case e.Count > 0:
		return e.Count
	case e.Series != nil && e.Series.Count > 0:
		return e.Series.Count
	default:
		return 1
	}
}

func eventSource(e *corev1.Event) string {
	if e.Source.Component != "" {
		return e.Source.Component
	}
	return e.ReportingController
}

func formatEventTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
