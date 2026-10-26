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
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
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

// TestEventsStream_ShutdownInterruptsStalledClient covers the slow-reader case: the client stops
// reading, events queue up and the handler blocks in a write. Close must still end the stream in
// time for Shutdown, rather than waiting for the queue to drain and the write deadline to pass.
func TestEventsStream_ShutdownInterruptsStalledClient(t *testing.T) {
	client, _ := newStartedClient(t, nil)
	router, v1 := newRouter()
	v1.GET("/events", NewEventsHandler(client, zaptest.NewLogger(t)).Stream)

	srv := httptest.NewServer(router)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(srv.Close)
	t.Cleanup(cancel)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET /events: %v", err)
	}
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	if line, err := reader.ReadString('\n'); err != nil || !strings.HasPrefix(line, "event: connected") {
		t.Fatalf("expected the connected event, got %q, %v", line, err)
	}
	// The client reads nothing from here on.

	// Far more than the socket buffers hold, so the handler blocks in a write with events still
	// queued on its channel. The payload string is shared, so the queue itself stays small.
	payload := strings.Repeat("x", 1<<20)
	for i := 0; i < 64; i++ {
		client.Broadcaster.Broadcast(k8s.ResourceEvent{Type: "update", Resource: "services", Name: "stalled", Data: payload})
	}
	time.Sleep(500 * time.Millisecond) // let the handler run into the blocked write

	client.Broadcaster.Close()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Config.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown did not complete while a stream was stalled: %v", err)
	}
}
