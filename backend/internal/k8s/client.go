package k8s

import (
	"fmt"
	"os"
	"sync"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	// DefaultCacheSyncTimeout bounds how long StartInformers waits for the caches to fill.
	DefaultCacheSyncTimeout = 60 * time.Second
	// DiscoveryTimeout bounds each API discovery request made at startup, so an unreachable
	// API server fails startup instead of hanging before the informers even start.
	DiscoveryTimeout = 30 * time.Second
	// informerResyncPeriod is how often informers replay their cache through UpdateFunc.
	informerResyncPeriod = 30 * time.Second
)

// EventBroadcaster fans resource events out to the SSE streams subscribed to it. Close ends every
// subscription at once, which is how shutdown gets the streams to return.
type EventBroadcaster struct {
	mu        sync.RWMutex
	listeners map[chan ResourceEvent]struct{}
	// done is closed by Close. Streams select on it, so shutdown reaches them even while events
	// are still queued on their channels.
	done chan struct{}
	// closed is set by Close. After that, Subscribe hands out closed channels and Broadcast
	// reaches nobody, so a stream that starts during shutdown ends immediately.
	closed bool
}

// ResourceEvent represents a change to a Kubernetes resource
type ResourceEvent struct {
	Type      string      `json:"type"`                // "add", "update", "delete"
	Resource  string      `json:"resource"`            // "models", "runtimes", "services", etc.
	Namespace string      `json:"namespace,omitempty"` // empty for cluster-scoped resources
	Name      string      `json:"name"`                // "name", or "namespace/name" when namespaced
	Data      interface{} `json:"data,omitempty"`
}

// Client wraps Kubernetes client functionality with informers
type Client struct {
	Clientset     kubernetes.Interface
	DynamicClient dynamic.Interface
	// Discovery answers which API resources the cluster serves. NewClient gives it its own
	// request timeout (DiscoveryTimeout); informer watches must stay unbounded, so the
	// timeout cannot live on the shared rest.Config.
	Discovery              discovery.DiscoveryInterface
	Config                 *rest.Config
	Logger                 *zap.Logger
	DynamicInformerFactory dynamicinformer.DynamicSharedInformerFactory
	InformerFactory        informers.SharedInformerFactory
	Broadcaster            *EventBroadcaster
	// Capabilities is what DiscoverCapabilities found. It is zero until discovery has run.
	Capabilities Capabilities
	// CacheSyncTimeout bounds how long StartInformers waits for the caches to fill. A missing
	// CRD or a missing list/watch permission would otherwise make the wait last forever.
	CacheSyncTimeout time.Duration
	// FieldValidation is the API server field validation mode for writes: Strict (default),
	// Warn or Ignore. See WriteOptions.
	FieldValidation string

	// registered holds the resources whose informers were created before StartInformers ran.
	// It is written during SetupInformers and only read afterwards.
	registered map[schema.GroupVersionResource]bool
	stopCh     chan struct{}
}

// NewClient creates a new Kubernetes client from the kubeconfig or the in-cluster config.
func NewClient(logger *zap.Logger) (*Client, error) {
	var config *rest.Config
	var err error

	// Try in-cluster config first
	if os.Getenv("KUBERNETES_IN_CLUSTER") == "true" {
		logger.Info("Using in-cluster Kubernetes configuration")
		config, err = rest.InClusterConfig()
	} else {
		// Use kubeconfig from environment or default location
		kubeconfig := os.Getenv("KUBECONFIG")
		if kubeconfig == "" {
			homeDir, _ := os.UserHomeDir()
			kubeconfig = homeDir + "/.kube/config"
		}
		logger.Info("Using kubeconfig file", zap.String("path", kubeconfig))
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	}

	if err != nil {
		return nil, err
	}

	// Create typed clientset
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	// Create dynamic client for CRDs
	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	// Discovery gets a bounded client of its own; see Client.Discovery.
	discoveryConfig := rest.CopyConfig(config)
	discoveryConfig.Timeout = DiscoveryTimeout
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(discoveryConfig)
	if err != nil {
		return nil, err
	}

	logger.Info("Kubernetes client initialized successfully")
	client := NewClientWith(clientset, dynamicClient, config, logger)
	client.Discovery = discoveryClient
	return client, nil
}

// NewClientWith wires a Client around existing API clients. NewClient uses it for real clusters;
// tests use it with the client-go fakes.
func NewClientWith(clientset kubernetes.Interface, dynamicClient dynamic.Interface, config *rest.Config, logger *zap.Logger) *Client {
	return &Client{
		Clientset:              clientset,
		DynamicClient:          dynamicClient,
		Discovery:              clientset.Discovery(),
		Config:                 config,
		Logger:                 logger,
		DynamicInformerFactory: dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, informerResyncPeriod),
		InformerFactory:        informers.NewSharedInformerFactory(clientset, informerResyncPeriod),
		Broadcaster:            NewEventBroadcaster(),
		CacheSyncTimeout:       DefaultCacheSyncTimeout,
		FieldValidation:        FieldValidationStrict,
		registered:             make(map[schema.GroupVersionResource]bool),
		stopCh:                 make(chan struct{}),
	}
}

// NewEventBroadcaster creates a new event broadcaster
func NewEventBroadcaster() *EventBroadcaster {
	return &EventBroadcaster{
		listeners: make(map[chan ResourceEvent]struct{}),
		done:      make(chan struct{}),
	}
}

// Done returns a channel that is closed once Close has been called.
func (eb *EventBroadcaster) Done() <-chan struct{} {
	return eb.done
}

// Subscribe adds a listener to receive events. After Close it returns a channel that is already
// closed, so the caller ends like every other stream.
func (eb *EventBroadcaster) Subscribe() chan ResourceEvent {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	ch := make(chan ResourceEvent, 100)
	if eb.closed {
		close(ch)
		return ch
	}
	eb.listeners[ch] = struct{}{}
	return ch
}

// Unsubscribe removes a listener and closes its channel. A channel that Close already ended is
// left alone, so a stream's deferred Unsubscribe is safe during shutdown.
func (eb *EventBroadcaster) Unsubscribe(ch chan ResourceEvent) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	if _, ok := eb.listeners[ch]; !ok {
		return
	}
	delete(eb.listeners, ch)
	close(ch)
}

// Close closes Done, ends every subscription by closing its channel, and makes later Subscribe
// calls return closed channels. Calling it again is a no-op.
func (eb *EventBroadcaster) Close() {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	if eb.closed {
		return
	}
	eb.closed = true
	close(eb.done)
	for ch := range eb.listeners {
		delete(eb.listeners, ch)
		close(ch)
	}
}

// Broadcast sends an event to all listeners. A channel leaves the map and is closed only under
// the write lock, so the sends here never reach a closed channel.
func (eb *EventBroadcaster) Broadcast(event ResourceEvent) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	for ch := range eb.listeners {
		select {
		case ch <- event:
		default:
			// Skip slow consumers
		}
	}
}

// StartInformers starts all registered informers and waits, up to CacheSyncTimeout, for their
// caches to sync. A cache that does not sync in time fails startup with an error naming the
// resource, which points at a missing CRD or a missing list/watch permission.
func (c *Client) StartInformers() error {
	c.Logger.Info("Starting Kubernetes informers...")

	// Start dynamic informer factory for CRDs
	c.DynamicInformerFactory.Start(c.stopCh)

	// Start standard informer factory for core resources
	c.InformerFactory.Start(c.stopCh)

	timeout := c.CacheSyncTimeout
	if timeout <= 0 {
		timeout = DefaultCacheSyncTimeout
	}
	c.Logger.Info("Waiting for informer caches to sync...", zap.Duration("timeout", timeout))

	// WaitForCacheSync returns early when this channel closes, reporting the unsynced caches.
	deadline := make(chan struct{})
	timer := time.AfterFunc(timeout, func() { close(deadline) })
	defer timer.Stop()

	// Sync dynamic informers (CRDs)
	for gvr, synced := range c.DynamicInformerFactory.WaitForCacheSync(deadline) {
		if !synced {
			c.Logger.Error("Timed out waiting for cache to sync", zap.String("resource", gvr.Resource))
			return fmt.Errorf("timed out after %s waiting for the %s cache to sync: check that the CRD is installed and that the console may list and watch it", timeout, gvr.Resource)
		}
	}

	// Sync standard informers (core resources)
	for informerType, synced := range c.InformerFactory.WaitForCacheSync(deadline) {
		if !synced {
			c.Logger.Error("Timed out waiting for cache to sync", zap.String("type", informerType.String()))
			return fmt.Errorf("timed out after %s waiting for the %s cache to sync: check that the console may list and watch it", timeout, informerType)
		}
	}

	c.Logger.Info("All informer caches synced successfully")
	return nil
}

// Stop stops all informers and waits for their goroutines, event handlers included, to exit,
// then closes the broadcaster so every SSE stream returns. Call it before http.Server.Shutdown:
// Shutdown waits for active connections, and an open stream would hold it to its deadline.
func (c *Client) Stop() {
	close(c.stopCh)
	c.DynamicInformerFactory.Shutdown()
	c.InformerFactory.Shutdown()
	c.Broadcaster.Close()
}
