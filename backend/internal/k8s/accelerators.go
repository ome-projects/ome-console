package k8s

import (
	"context"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	// AcceleratorClass GVR
	AcceleratorClassGVR = schema.GroupVersionResource{
		Group:    OMEGroup,
		Version:  OMEVersion,
		Resource: "acceleratorclasses",
	}
)

// ListAcceleratorClasses returns all AcceleratorClasses in the cluster from cache
func (c *Client) ListAcceleratorClasses(ctx context.Context) (*unstructured.UnstructuredList, error) {
	return c.listFromCache(AcceleratorClassGVR, "", nil)
}

// GetAcceleratorClass returns a specific AcceleratorClass by name from cache
func (c *Client) GetAcceleratorClass(ctx context.Context, name string) (*unstructured.Unstructured, error) {
	return c.getFromCache(AcceleratorClassGVR, "", name)
}
