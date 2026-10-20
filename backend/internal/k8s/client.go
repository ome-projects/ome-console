package k8s

import (
	"fmt"
	"os"
	"sync"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/runtime/schema"
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
	// informerResyncPeriod is how often informers replay their cache through UpdateFunc.
	informerResyncPeriod = 30 * time.Second
)

// EventBroadcaster handles real-time event broadcasting
type EventBroadcaster struct {
	mu        sync.RWMutex
	listeners map[chan ResourceEvent]struct{}
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
	Clientset              kubernetes.Interface
	DynamicClient          dynamic.Interface
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

	logger.Info("Kubernetes client initialized successfully")
	return NewClientWith(clientset, dynamicClient, config, logger), nil
}

// NewClientWith wires a Client around existing API clients. NewClient uses it for real clusters;
// tests use it with the client-go fakes.
func NewClientWith(clientset kubernetes.Interface, dynamicClient dynamic.Interface, config *rest.Config, logger *zap.Logger) *Client {
	return &Client{
		Clientset:              clientset,
		DynamicClient:          dynamicClient,
		Config:                 config,
		Logger:                 logger,
		DynamicInformerFactory: dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, informerResyncPeriod),
		InformerFactory:        informers.NewSharedInformerFactory(clientset, informerResyncPeriod),
		Broadcaster:            NewEventBroadcaster(),
		CacheSyncTimeout:       DefaultCacheSyncTimeout,
		registered:             make(map[schema.GroupVersionResource]bool),
		stopCh:                 make(chan struct{}),
	}
}

// NewEventBroadcaster creates a new event broadcaster
func NewEventBroadcaster() *EventBroadcaster {
	return &EventBroadcaster{
		listeners: make(map[chan ResourceEvent]struct{}),
	}
}

// Subscribe adds a listener to receive events
func (eb *EventBroadcaster) Subscribe() chan ResourceEvent {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	ch := make(chan ResourceEvent, 100)
	eb.listeners[ch] = struct{}{}
	return ch
}

// Unsubscribe removes a listener
func (eb *EventBroadcaster) Unsubscribe(ch chan ResourceEvent) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	delete(eb.listeners, ch)
	close(ch)
}

// Broadcast sends an event to all listeners
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

// Stop stops all informers
func (c *Client) Stop() {
	close(c.stopCh)
}
