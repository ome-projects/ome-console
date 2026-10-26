package handlers

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
)

// TestEventsStream_EndsOnBroadcasterClose covers the shutdown sequence in cmd/api/main.go: once
// the broadcaster is closed, an open SSE stream returns and http.Server.Shutdown completes
// instead of waiting for its deadline.
func TestEventsStream_EndsOnBroadcasterClose(t *testing.T) {
	client, _ := newStartedClient(t, nil)
	router, v1 := newRouter()
	v1.GET("/events", NewEventsHandler(client, zaptest.NewLogger(t)).Stream)

	srv := httptest.NewServer(router)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(srv.Close)
	t.Cleanup(cancel) // runs before srv.Close, so a stream that never ended cannot block it

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /events: %v", err)
	}
	defer resp.Body.Close()

	// The stream is up once the connected event has arrived.
	reader := bufio.NewReader(resp.Body)
	line, err := reader.ReadString('\n')
	if err != nil || !strings.HasPrefix(line, "event: connected") {
		t.Fatalf("expected the connected event, got %q, %v", line, err)
	}

	client.Broadcaster.Close()

	ended := make(chan error, 1)
	go func() {
		_, err := io.Copy(io.Discard, reader)
		ended <- err
	}()
	select {
	case err := <-ended:
		if err != nil {
			t.Fatalf("stream ended with error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("stream still open 5s after Broadcaster.Close")
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Config.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown did not complete after the stream ended: %v", err)
	}
}
