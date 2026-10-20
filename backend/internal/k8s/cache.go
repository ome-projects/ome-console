package k8s

import (
	"errors"
	"fmt"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ErrNotSupported is returned when a resource has no running informer because the connected
// cluster does not serve it. Handlers can surface it as "feature unavailable" instead of
// reporting an empty cluster.
var ErrNotSupported = errors.New("resource is not served by this cluster")

// requireInformer fails fast for resources whose informer was never registered. Asking the
// factory for such a resource after it started would silently create an informer that never
// syncs, and its lister would answer every query with nothing.
func (c *Client) requireInformer(gvr schema.GroupVersionResource) error {
	if !c.registered[gvr] {
		return fmt.Errorf("%s: %w", gvr.Resource, ErrNotSupported)
	}
	return nil
}

// listFromCache lists objects of a resource from its informer cache. An empty namespace lists
// across all namespaces, and is the only valid value for cluster-scoped resources.
func (c *Client) listFromCache(gvr schema.GroupVersionResource, namespace string) (*unstructured.UnstructuredList, error) {
	if err := c.requireInformer(gvr); err != nil {
		return nil, err
	}

	lister := c.DynamicInformerFactory.ForResource(gvr).Lister()
	var (
		objs []runtime.Object
		err  error
	)
	if namespace == "" {
		objs, err = lister.List(labels.Everything())
	} else {
		objs, err = lister.ByNamespace(namespace).List(labels.Everything())
	}
	if err != nil {
		return nil, err
	}

	items := make([]unstructured.Unstructured, 0, len(objs))
	for _, obj := range objs {
		u, ok := obj.(*unstructured.Unstructured)
		if !ok {
			return nil, fmt.Errorf("unexpected object type %T in %s cache", obj, gvr.Resource)
		}
		items = append(items, *u)
	}
	return &unstructured.UnstructuredList{Items: items}, nil
}

// getFromCache returns one object of a resource from its informer cache. Pass an empty
// namespace for cluster-scoped resources.
func (c *Client) getFromCache(gvr schema.GroupVersionResource, namespace, name string) (*unstructured.Unstructured, error) {
	if err := c.requireInformer(gvr); err != nil {
		return nil, err
	}

	lister := c.DynamicInformerFactory.ForResource(gvr).Lister()
	var (
		obj runtime.Object
		err error
	)
	if namespace == "" {
		obj, err = lister.Get(name)
	} else {
		obj, err = lister.ByNamespace(namespace).Get(name)
	}
	if err != nil {
		return nil, err
	}

	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil, fmt.Errorf("unexpected object type %T in %s cache", obj, gvr.Resource)
	}
	return u, nil
}
