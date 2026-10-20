package k8s

import (
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakediscovery "k8s.io/client-go/discovery/fake"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

// coreResourceNames are the resources every OME release serves.
var coreResourceNames = []string{
	"inferenceservices", "basemodels", "clusterbasemodels",
	"servingruntimes", "clusterservingruntimes", "acceleratorclasses",
}

// newTestClient builds a Client on the client-go fakes. served lists the OME resources the fake
// API server advertises; nil means the ome.io group is not installed at all.
func newTestClient(t *testing.T, served []string, objs ...runtime.Object) (*Client, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	clientset := k8sfake.NewSimpleClientset()
	if served != nil {
		resources := make([]metav1.APIResource, 0, len(served))
		for _, name := range served {
			resources = append(resources, metav1.APIResource{Name: name, Kind: kindOf(name), Namespaced: true})
		}
		clientset.Discovery().(*fakediscovery.FakeDiscovery).Resources = []*metav1.APIResourceList{
			{GroupVersion: OMEGroupVersion, APIResources: resources},
		}
	}

	listKinds := make(map[schema.GroupVersionResource]string, len(KnownResources))
	for _, r := range KnownResources {
		listKinds[r.GVR()] = r.Kind + "List"
	}
	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), listKinds, objs...)

	c := NewClientWith(clientset, dynamicClient, nil, zaptest.NewLogger(t))
	c.CacheSyncTimeout = 5 * time.Second
	return c, dynamicClient
}

func kindOf(resource string) string {
	for _, r := range KnownResources {
		if r.Resource == resource {
			return r.Kind
		}
	}
	return resource
}

// newObject builds an unstructured OME object for the fake dynamic client.
func newObject(kind, namespace, name, resourceVersion string) *unstructured.Unstructured {
	u := &unstructured.Unstructured{}
	u.SetAPIVersion(OMEGroupVersion)
	u.SetKind(kind)
	u.SetNamespace(namespace)
	u.SetName(name)
	u.SetResourceVersion(resourceVersion)
	return u
}

func createOptions() metav1.CreateOptions { return metav1.CreateOptions{} }
