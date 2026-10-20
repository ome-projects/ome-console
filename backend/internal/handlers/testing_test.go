package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap/zaptest"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakediscovery "k8s.io/client-go/discovery/fake"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// newStartedClient builds a Client on the client-go fakes, advertising the given OME resources,
// and runs discovery, informer setup and cache sync so handlers can read from the cache.
func newStartedClient(t *testing.T, served []string, objs ...runtime.Object) (*k8s.Client, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	clientset := k8sfake.NewSimpleClientset()
	resources := make([]metav1.APIResource, 0, len(served))
	for _, name := range served {
		r, _ := k8s.ResourceByName(name)
		resources = append(resources, metav1.APIResource{Name: name, Kind: r.Kind, Namespaced: r.Namespaced})
	}
	clientset.Discovery().(*fakediscovery.FakeDiscovery).Resources = []*metav1.APIResourceList{
		{GroupVersion: k8s.OMEGroupVersion, APIResources: resources},
	}

	listKinds := make(map[schema.GroupVersionResource]string, len(k8s.KnownResources))
	for _, r := range k8s.KnownResources {
		listKinds[r.GVR()] = r.ListKind()
	}
	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), listKinds, objs...)

	client := k8s.NewClientWith(clientset, dynamicClient, nil, zaptest.NewLogger(t))
	client.CacheSyncTimeout = 5 * time.Second
	if _, err := client.DiscoverCapabilities(context.Background()); err != nil {
		t.Fatalf("DiscoverCapabilities: %v", err)
	}
	if err := client.SetupInformers(); err != nil {
		t.Fatalf("SetupInformers: %v", err)
	}
	if err := client.StartInformers(); err != nil {
		t.Fatalf("StartInformers: %v", err)
	}
	t.Cleanup(client.Stop)
	return client, dynamicClient
}

// newObject builds an unstructured OME object for the fake dynamic client.
func newObject(kind, namespace, name string, spec map[string]interface{}) *unstructured.Unstructured {
	u := &unstructured.Unstructured{Object: map[string]interface{}{}}
	u.SetAPIVersion(k8s.OMEGroupVersion)
	u.SetKind(kind)
	u.SetNamespace(namespace)
	u.SetName(name)
	if spec != nil {
		_ = unstructured.SetNestedMap(u.Object, spec, "spec")
	}
	return u
}

func newRouter() (*gin.Engine, *gin.RouterGroup) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	return router, router.Group("/api/v1")
}
