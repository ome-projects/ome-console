package k8s

import (
	"errors"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"
)

// coreInformers are the resources the console watches today. The SSE key comes from the
// registry, so the cluster- and namespace-scoped variants of a kind share one key.
var coreInformers = []OMEResource{
	ClusterBaseModelResource,
	BaseModelResource,
	ClusterServingRuntimeResource,
	ServingRuntimeResource,
	InferenceServiceResource,
	AcceleratorClassResource,
	// Only served by OME v1.3 clusters; discovery skips it elsewhere.
	InferenceReplicaResource,
}

// SetupInformers registers an informer for every core OME resource the cluster serves, plus the
// Namespace informer. DiscoverCapabilities must run first: a resource the cluster does not serve
// gets no informer, so StartInformers cannot block on a cache that would never sync.
func (c *Client) SetupInformers() error {
	if c.Capabilities.CheckedAt.IsZero() {
		return errors.New("capabilities not discovered: call DiscoverCapabilities before SetupInformers")
	}

	c.Logger.Info("Setting up informers with event handlers...")
	for _, res := range coreInformers {
		if !c.Capabilities.Supports(res.Resource) {
			c.Logger.Warn("OME resource is not served by this cluster; features that need it are disabled",
				zap.String("kind", res.Kind),
				zap.String("resource", res.Resource))
			continue
		}
		c.registerInformer(res)
	}
	c.setupNamespaceInformer()
	c.Logger.Info("Informers setup completed")
	return nil
}

// registerInformer creates the informer for a resource and records that it will be started.
func (c *Client) registerInformer(res OMEResource) {
	informer := c.DynamicInformerFactory.ForResource(res.GVR()).Informer()
	if _, err := informer.AddEventHandler(c.eventHandlerFor(res)); err != nil {
		c.Logger.Error("Failed to add event handler", zap.String("kind", res.Kind), zap.Error(err))
	}
	c.registered[res.GVR()] = true
}

// eventHandlerFor builds the handler that turns informer callbacks into ResourceEvents.
func (c *Client) eventHandlerFor(res OMEResource) cache.ResourceEventHandlerFuncs {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if u, ok := asUnstructured(obj); ok {
				c.broadcast("add", res, u, true)
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			u, ok := asUnstructured(newObj)
			if !ok {
				return
			}
			// The periodic resync replays every object through UpdateFunc. Nothing changed when
			// the resourceVersion is the same, so skip the broadcast.
			if old, ok := asUnstructured(oldObj); ok && old.GetResourceVersion() == u.GetResourceVersion() {
				return
			}
			c.broadcast("update", res, u, true)
		},
		DeleteFunc: func(obj interface{}) {
			if u, ok := asUnstructured(obj); ok {
				c.broadcast("delete", res, u, false)
			}
		},
	}
}

// asUnstructured extracts the object behind an informer callback argument. When the informer
// missed the final delete event it hands DeleteFunc a tombstone instead of the object.
func asUnstructured(obj interface{}) (*unstructured.Unstructured, bool) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	u, ok := obj.(*unstructured.Unstructured)
	return u, ok
}

// broadcast publishes a ResourceEvent for the object to every SSE subscriber.
func (c *Client) broadcast(eventType string, res OMEResource, u *unstructured.Unstructured, includeData bool) {
	name := u.GetName()
	if res.Namespaced {
		name = u.GetNamespace() + "/" + name
	}
	c.Logger.Debug("Resource event",
		zap.String("type", eventType),
		zap.String("kind", res.Kind),
		zap.String("name", name))

	event := ResourceEvent{
		Type:      eventType,
		Resource:  res.Key,
		Namespace: u.GetNamespace(),
		Name:      name,
	}
	if includeData {
		event.Data = u.Object
	}
	c.Broadcaster.Broadcast(event)
}

// setupNamespaceInformer sets up the Namespace informer. Namespaces are only read from the
// cache, so no events are broadcast for them.
func (c *Client) setupNamespaceInformer() {
	informer := c.InformerFactory.Core().V1().Namespaces().Informer()
	if _, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{}); err != nil {
		c.Logger.Error("Failed to add event handler for Namespace", zap.Error(err))
	}
}
