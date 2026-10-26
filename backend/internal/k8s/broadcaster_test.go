package k8s

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestEventBroadcaster_CloseEndsSubscriptions(t *testing.T) {
	eb := NewEventBroadcaster()
	first := eb.Subscribe()
	second := eb.Subscribe()

	eb.Broadcast(ResourceEvent{Type: "add", Resource: "models", Name: "llama"})
	for _, ch := range []chan ResourceEvent{first, second} {
		select {
		case ev := <-ch:
			if ev.Name != "llama" {
				t.Fatalf("unexpected event %+v", ev)
			}
		case <-time.After(time.Second):
			t.Fatal("event not delivered before Close")
		}
	}

	select {
	case <-eb.Done():
		t.Fatal("Done closed before Close")
	default:
	}

	eb.Close()
	eb.Close() // a second Close is a no-op

	select {
	case <-eb.Done():
	default:
		t.Fatal("Done not closed by Close")
	}
	assertClosed(t, first)
	assertClosed(t, second)
	// A stream that starts during shutdown ends immediately.
	assertClosed(t, eb.Subscribe())
	// A stream's deferred Unsubscribe and a late broadcast must not panic.
	eb.Unsubscribe(first)
	eb.Broadcast(ResourceEvent{Type: "update", Resource: "models", Name: "llama"})
}

func TestEventBroadcaster_CloseUnderConcurrentUse(t *testing.T) {
	eb := NewEventBroadcaster()
	for i := 0; i < 8; i++ {
		eb.Subscribe() // never drained: Broadcast skips them once their buffers fill
	}

	done := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
					eb.Broadcast(ResourceEvent{Type: "update", Resource: "services", Name: "x"})
				}
			}
		}()
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
					eb.Unsubscribe(eb.Subscribe())
				}
			}
		}()
	}

	time.Sleep(20 * time.Millisecond)
	eb.Close() // must not send on, or double close, any channel
	close(done)
	wg.Wait()
}

func TestStop_EndsSubscriptions(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)
	if _, err := c.DiscoverCapabilities(context.Background()); err != nil {
		t.Fatalf("DiscoverCapabilities: %v", err)
	}
	if err := c.SetupInformers(); err != nil {
		t.Fatalf("SetupInformers: %v", err)
	}
	if err := c.StartInformers(); err != nil {
		t.Fatalf("StartInformers: %v", err)
	}
	events := c.Broadcaster.Subscribe()

	c.Stop()

	assertClosed(t, events)
}

// assertClosed drains ch and fails unless it is closed within a second.
func assertClosed(t *testing.T, ch chan ResourceEvent) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("channel not closed")
		}
	}
}
