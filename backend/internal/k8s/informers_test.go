package k8s

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"
)

func startClient(t *testing.T, c *Client) {
	t.Helper()
	if _, err := c.DiscoverCapabilities(context.Background()); err != nil {
		t.Fatalf("DiscoverCapabilities: %v", err)
	}
	if err := c.SetupInformers(); err != nil {
		t.Fatalf("SetupInformers: %v", err)
	}
	if err := c.StartInformers(); err != nil {
		t.Fatalf("StartInformers: %v", err)
	}
	t.Cleanup(c.Stop)
}

func TestInformers_SkipUnservedResourcesAndReportThem(t *testing.T) {
	served := []string{"inferenceservices", "basemodels", "clusterbasemodels", "servingruntimes", "clusterservingruntimes"}
	c, _ := newTestClient(t, served, newObject("ClusterBaseModel", "", "llama", "1"))
	startClient(t, c)

	models, err := c.ListClusterBaseModels(context.Background())
	if err != nil {
		t.Fatalf("ListClusterBaseModels: %v", err)
	}
	if len(models.Items) != 1 || models.Items[0].GetName() != "llama" {
		t.Fatalf("expected the seeded model, got %+v", models.Items)
	}

	_, err = c.ListAcceleratorClasses(context.Background())
	if !errors.Is(err, ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported for a resource the cluster does not serve, got %v", err)
	}
	if _, err := c.GetAcceleratorClass(context.Background(), "a100"); !errors.Is(err, ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported from Get, got %v", err)
	}
}

func TestInformers_StartWithoutOME(t *testing.T) {
	c, _ := newTestClient(t, nil)
	startClient(t, c)

	if _, err := c.ListInferenceServices(context.Background(), ""); !errors.Is(err, ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported, got %v", err)
	}
	if _, err := c.ListNamespaces(context.Background()); err != nil {
		t.Fatalf("namespaces must still work without OME: %v", err)
	}
}

func TestStartInformers_TimesOutInsteadOfHanging(t *testing.T) {
	c, dynamicClient := newTestClient(t, coreResourceNames)
	dynamicClient.PrependReactor("list", "inferenceservices", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forbidden")
	})
	if _, err := c.DiscoverCapabilities(context.Background()); err != nil {
		t.Fatalf("DiscoverCapabilities: %v", err)
	}
	if err := c.SetupInformers(); err != nil {
		t.Fatalf("SetupInformers: %v", err)
	}
	c.CacheSyncTimeout = 300 * time.Millisecond
	t.Cleanup(c.Stop)

	done := make(chan error, 1)
	go func() { done <- c.StartInformers() }()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected StartInformers to fail when a cache cannot sync")
		}
		if !strings.Contains(err.Error(), "inferenceservices") {
			t.Fatalf("error should name the resource, got: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("StartInformers hung instead of timing out")
	}
}

func TestInformers_BroadcastEvents(t *testing.T) {
	c, dynamicClient := newTestClient(t, coreResourceNames)
	startClient(t, c)

	events := c.Broadcaster.Subscribe()
	defer c.Broadcaster.Unsubscribe(events)

	obj := newObject("InferenceService", "team-a", "llama", "1")
	if _, err := dynamicClient.Resource(InferenceServiceGVR).Namespace("team-a").Create(context.Background(), obj, createOptions()); err != nil {
		t.Fatalf("create: %v", err)
	}

	select {
	case ev := <-events:
		if ev.Type != "add" || ev.Resource != "services" || ev.Namespace != "team-a" || ev.Name != "team-a/llama" {
			t.Fatalf("unexpected event %+v", ev)
		}
		if ev.Data == nil {
			t.Fatal("add events carry the object")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no add event received")
	}
}

func TestEventHandler_IgnoresResyncAndSurvivesTombstones(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)
	events := c.Broadcaster.Subscribe()
	defer c.Broadcaster.Unsubscribe(events)

	handler := c.eventHandlerFor(coreInformers[0]) // ClusterBaseModel, cluster-scoped
	v1 := newObject("ClusterBaseModel", "", "llama", "1")
	v2 := newObject("ClusterBaseModel", "", "llama", "2")

	handler.OnUpdate(v1, v1)
	select {
	case ev := <-events:
		t.Fatalf("a resync with the same resourceVersion must not broadcast, got %+v", ev)
	case <-time.After(50 * time.Millisecond):
	}

	handler.OnUpdate(v1, v2)
	expectEvent(t, events, "update", "llama")

	handler.OnDelete(cache.DeletedFinalStateUnknown{Key: "llama", Obj: v2})
	ev := expectEvent(t, events, "delete", "llama")
	if ev.Data != nil {
		t.Error("delete events must not carry the object")
	}

	handler.OnDelete("not an object")
	select {
	case ev := <-events:
		t.Fatalf("an unknown object type must be ignored, got %+v", ev)
	case <-time.After(50 * time.Millisecond):
	}
}

func expectEvent(t *testing.T, events chan ResourceEvent, eventType, name string) ResourceEvent {
	t.Helper()
	select {
	case ev := <-events:
		if ev.Type != eventType || ev.Name != name {
			t.Fatalf("expected %s event for %s, got %+v", eventType, name, ev)
		}
		return ev
	case <-time.After(2 * time.Second):
		t.Fatalf("no %s event received", eventType)
		return ResourceEvent{}
	}
}
