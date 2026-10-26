package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

const (
	// keepAliveInterval is how often the stream sends a ping so proxies and clients see traffic.
	keepAliveInterval = 30 * time.Second
	// sseWriteTimeout is renewed before every write. The server's global WriteTimeout would
	// end this long-lived response; a per-write deadline still drops a client that stops reading.
	sseWriteTimeout = 2 * keepAliveInterval
)

// defaultAllowedOrigins is used when CORS_ALLOWED_ORIGINS is not set
var defaultAllowedOrigins = []string{"http://localhost:3000", "http://localhost:3001"}

// getAllowedOrigins returns the list of allowed CORS origins
func getAllowedOrigins() []string {
	if origins := os.Getenv("CORS_ALLOWED_ORIGINS"); origins != "" {
		return strings.Split(origins, ",")
	}
	return defaultAllowedOrigins
}

// isOriginAllowed checks if the given origin is in the allowed list
func isOriginAllowed(origin string) bool {
	for _, allowed := range getAllowedOrigins() {
		if strings.TrimSpace(allowed) == origin {
			return true
		}
	}
	return false
}

// EventsHandler handles SSE connections for real-time updates
type EventsHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

// NewEventsHandler creates a new events handler
func NewEventsHandler(k8sClient *k8s.Client, logger *zap.Logger) *EventsHandler {
	return &EventsHandler{
		k8sClient: k8sClient,
		logger:    logger,
	}
}

// Stream handles SSE connections for real-time Kubernetes resource updates
func (h *EventsHandler) Stream(c *gin.Context) {
	// Validate and set CORS origin header
	origin := c.GetHeader("Origin")
	if origin != "" && isOriginAllowed(origin) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	// Set headers for SSE
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	// Subscribe to events
	eventChan := h.k8sClient.Broadcaster.Subscribe()
	defer h.k8sClient.Broadcaster.Unsubscribe(eventChan)
	// shutdown is closed by Broadcaster.Close. From then on queued events are dropped and nothing
	// is written: the stream returns so http.Server.Shutdown sees an idle connection.
	shutdown := h.k8sClient.Broadcaster.Done()

	clientIP := c.ClientIP()
	h.logger.Info("SSE client connected", zap.String("client_ip", clientIP))

	// Renew the write deadline before each write; without this the server's WriteTimeout
	// would cut the stream. Writers that cannot set deadlines (tests) are left alone.
	controller := http.NewResponseController(c.Writer)
	// A write to a stalled client blocks until that deadline. If shutdown starts during a write,
	// the deadline is moved to now so the write returns; a stream that is idle at that moment is
	// left alone so the response can end cleanly. Nothing is written once shutdown has started.
	var mu sync.Mutex
	frozen, writing := false, false
	write := func(frame string) bool {
		mu.Lock()
		if frozen {
			mu.Unlock()
			return false
		}
		writing = true
		if err := controller.SetWriteDeadline(time.Now().Add(sseWriteTimeout)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			h.logger.Debug("Could not set SSE write deadline", zap.Error(err))
		}
		mu.Unlock()

		_, _ = c.Writer.WriteString(frame)
		c.Writer.Flush()

		mu.Lock()
		writing = false
		mu.Unlock()
		return true
	}
	// The request context ends when the client disconnects or when this handler returns.
	ctx := c.Request.Context()
	go func() {
		select {
		case <-shutdown:
			mu.Lock()
			frozen = true
			if writing {
				_ = controller.SetWriteDeadline(time.Now())
			}
			mu.Unlock()
		case <-ctx.Done():
		}
	}()

	// Send initial connection confirmation
	if !write("event: connected\ndata: {\"message\": \"Connected to event stream\"}\n\n") {
		h.logger.Info("SSE stream ended for shutdown", zap.String("client_ip", clientIP))
		return
	}

	// Create a ticker for periodic keep-alive messages
	ticker := time.NewTicker(keepAliveInterval)
	defer ticker.Stop()

	// Listen for events and send to client
	for {
		var frame string
		select {
		case <-shutdown:
		case event, ok := <-eventChan:
			if !ok {
				// Only Close ends a subscription, so this is shutdown as well.
				break
			}
			data, err := json.Marshal(event)
			if err != nil {
				h.logger.Error("Failed to marshal event", zap.Error(err))
				continue
			}
			// Format: event: <event-type>\ndata: <json-data>\n\n
			frame = fmt.Sprintf("event: %s\ndata: %s\n\n", event.Type, data)
		case <-ticker.C:
			frame = fmt.Sprintf("event: ping\ndata: {\"timestamp\": \"%s\"}\n\n", time.Now().Format(time.RFC3339))
		case <-ctx.Done():
			h.logger.Info("SSE client disconnected", zap.String("client_ip", clientIP))
			return
		}
		if frame == "" || !write(frame) {
			h.logger.Info("SSE stream ended for shutdown", zap.String("client_ip", clientIP))
			return
		}
	}
}
