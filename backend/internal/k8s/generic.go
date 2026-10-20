package k8s

import (
	"context"
	"fmt"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

// FieldValidation values accepted by the API server for create, update and patch requests.
const (
	FieldValidationStrict = metav1.FieldValidationStrict
	FieldValidationWarn   = metav1.FieldValidationWarn
	FieldValidationIgnore = metav1.FieldValidationIgnore
)

// WriteOptions control how a create, update or patch request is sent.
type WriteOptions struct {
	// DryRun asks the API server to run admission and validation without persisting anything.
	DryRun bool
	// FieldValidation overrides the client's default. Strict makes the API server reject fields
	// the CRD does not declare, so a field that OME removed fails loudly instead of being pruned.
	FieldValidation string
}

func (c *Client) fieldValidation(opts WriteOptions) string {
	if opts.FieldValidation != "" {
		return opts.FieldValidation
	}
	if c.FieldValidation != "" {
		return c.FieldValidation
	}
	return FieldValidationStrict
}

func dryRun(opts WriteOptions) []string {
	if opts.DryRun {
		return []string{metav1.DryRunAll}
	}
	return nil
}

// resourceClient returns the dynamic client for a resource, scoped to a namespace when the
// resource is namespaced.
func (c *Client) resourceClient(res OMEResource, namespace string) dynamic.ResourceInterface {
	if res.Namespaced {
		return c.DynamicClient.Resource(res.GVR()).Namespace(namespace)
	}
	return c.DynamicClient.Resource(res.GVR())
}

// requireSupported fails writes to a resource the cluster does not serve with ErrNotSupported,
// which handlers turn into a clear "feature unavailable" answer. The check only applies once
// DiscoverCapabilities has run.
func (c *Client) requireSupported(res OMEResource) error {
	if !c.Capabilities.CheckedAt.IsZero() && !c.Capabilities.Supports(res.Resource) {
		return fmt.Errorf("%s: %w", res.Resource, ErrNotSupported)
	}
	return nil
}

// List returns the cached objects of a resource. An empty namespace lists across all namespaces.
func (c *Client) List(res OMEResource, namespace string, selector labels.Selector) (*unstructured.UnstructuredList, error) {
	if !res.Namespaced {
		namespace = ""
	}
	return c.listFromCache(res.GVR(), namespace, selector)
}

// Get returns one cached object of a resource.
func (c *Client) Get(res OMEResource, namespace, name string) (*unstructured.Unstructured, error) {
	if !res.Namespaced {
		namespace = ""
	}
	return c.getFromCache(res.GVR(), namespace, name)
}

// Create creates an object of a resource. apiVersion and kind are set from the resource so
// callers can post a bare {metadata, spec}; a namespaced object is created in namespace.
func (c *Client) Create(ctx context.Context, res OMEResource, namespace string, obj *unstructured.Unstructured, opts WriteOptions) (*unstructured.Unstructured, error) {
	if err := c.requireSupported(res); err != nil {
		return nil, err
	}
	if err := c.prepareObject(res, namespace, obj); err != nil {
		return nil, err
	}
	return c.resourceClient(res, namespace).Create(ctx, obj, metav1.CreateOptions{
		DryRun:          dryRun(opts),
		FieldValidation: c.fieldValidation(opts),
	})
}

// Update replaces an object of a resource. The object must carry the resourceVersion it was read
// at; the API server answers a stale one with a Conflict.
func (c *Client) Update(ctx context.Context, res OMEResource, namespace string, obj *unstructured.Unstructured, opts WriteOptions) (*unstructured.Unstructured, error) {
	if err := c.requireSupported(res); err != nil {
		return nil, err
	}
	if err := c.prepareObject(res, namespace, obj); err != nil {
		return nil, err
	}
	return c.resourceClient(res, namespace).Update(ctx, obj, metav1.UpdateOptions{
		DryRun:          dryRun(opts),
		FieldValidation: c.fieldValidation(opts),
	})
}

// Delete deletes one object of a resource.
func (c *Client) Delete(ctx context.Context, res OMEResource, namespace, name string) error {
	if err := c.requireSupported(res); err != nil {
		return err
	}
	return c.resourceClient(res, namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// Patch applies a JSON patch, merge patch or strategic merge patch to one object of a resource,
// optionally on a subresource such as "status" or "scale".
func (c *Client) Patch(ctx context.Context, res OMEResource, namespace, name string, patchType types.PatchType, data []byte, opts WriteOptions, subresources ...string) (*unstructured.Unstructured, error) {
	if err := c.requireSupported(res); err != nil {
		return nil, err
	}
	return c.resourceClient(res, namespace).Patch(ctx, name, patchType, data, metav1.PatchOptions{
		DryRun:          dryRun(opts),
		FieldValidation: c.fieldValidation(opts),
	}, subresources...)
}

// prepareObject stamps apiVersion and kind and checks the namespace before a write. A failed
// check is the caller's mistake, so it is a BadRequest and handlers answer 400.
func (c *Client) prepareObject(res OMEResource, namespace string, obj *unstructured.Unstructured) error {
	if obj == nil || obj.Object == nil {
		return apierrors.NewBadRequest(fmt.Sprintf("%s: object is required", res.Kind))
	}
	obj.SetAPIVersion(OMEGroupVersion)
	obj.SetKind(res.Kind)

	if !res.Namespaced {
		if ns := obj.GetNamespace(); ns != "" {
			return apierrors.NewBadRequest(fmt.Sprintf("%s is cluster-scoped but metadata.namespace is %q", res.Kind, ns))
		}
		return nil
	}
	if namespace == "" {
		return apierrors.NewBadRequest(fmt.Sprintf("%s is namespaced: a namespace is required", res.Kind))
	}
	if ns := obj.GetNamespace(); ns != "" && ns != namespace {
		return apierrors.NewBadRequest(fmt.Sprintf("metadata.namespace %q does not match the request namespace %q", ns, namespace))
	}
	obj.SetNamespace(namespace)
	return nil
}
