package k8s

import (
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	// OMEGroup is the API group of every OME custom resource.
	OMEGroup = "ome.io"
	// OMEVersion is the API version the console speaks.
	OMEVersion = "v1beta1"
	// OMEGroupVersion is the discovery path for the OME API.
	OMEGroupVersion = OMEGroup + "/" + OMEVersion
)

// OMEResource describes one OME API resource the console knows about.
type OMEResource struct {
	// Resource is the plural name the API server serves, e.g. "inferenceservices".
	Resource string
	// Kind is the resource kind, e.g. "InferenceService".
	Kind string
	// Namespaced is true for namespace-scoped resources.
	Namespaced bool
	// Key is the console-facing name used in API paths (/api/v1/<key>) and in SSE events.
	// The cluster- and namespace-scoped variants of a kind share one key.
	Key string
}

// GVR returns the GroupVersionResource of the resource.
func (r OMEResource) GVR() schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: OMEGroup, Version: OMEVersion, Resource: r.Resource}
}

// ListKind is the kind of the resource's list type, e.g. "InferenceServiceList".
func (r OMEResource) ListKind() string {
	return r.Kind + "List"
}

// KnownResources lists every OME resource the console can work with. Older OME releases and
// partial installs serve only some of them; DiscoverCapabilities reports which ones the connected
// cluster has, and the console disables the features that depend on the missing ones.
var KnownResources = []OMEResource{
	{Resource: "inferenceservices", Kind: "InferenceService", Namespaced: true, Key: "services"},
	{Resource: "basemodels", Kind: "BaseModel", Namespaced: true, Key: "models"},
	{Resource: "clusterbasemodels", Kind: "ClusterBaseModel", Key: "models"},
	{Resource: "servingruntimes", Kind: "ServingRuntime", Namespaced: true, Key: "runtimes"},
	{Resource: "clusterservingruntimes", Kind: "ClusterServingRuntime", Key: "runtimes"},
	{Resource: "acceleratorclasses", Kind: "AcceleratorClass", Key: "accelerators"},
	{Resource: "finetunedweights", Kind: "FineTunedWeight", Key: "finetunedweights"},
	{Resource: "benchmarkjobs", Kind: "BenchmarkJob", Namespaced: true, Key: "benchmarkjobs"},
	// Added in OME v1.3.
	{Resource: "inferencereplicas", Kind: "InferenceReplica", Namespaced: true, Key: "replicas"},
	{Resource: "rolloutpolicies", Kind: "RolloutPolicy", Namespaced: true, Key: "rolloutpolicies"},
	{Resource: "autoscalerpolicies", Kind: "AutoscalerPolicy", Namespaced: true, Key: "autoscalerpolicies"},
	{Resource: "acceleratorquotas", Kind: "AcceleratorQuota", Key: "acceleratorquotas"},
	{Resource: "workloadclusters", Kind: "WorkloadCluster", Key: "workloadclusters"},
	{Resource: "trafficmaps", Kind: "TrafficMap", Namespaced: true, Key: "trafficmaps"},
}

// ResourceByName returns the known resource with the given plural name.
func ResourceByName(resource string) (OMEResource, bool) {
	for _, r := range KnownResources {
		if r.Resource == resource {
			return r, true
		}
	}
	return OMEResource{}, false
}

// MustResource returns the known resource with the given plural name and panics when the name is
// not in the registry. It is meant for package-level wiring, where a typo is a programming error.
func MustResource(resource string) OMEResource {
	r, ok := ResourceByName(resource)
	if !ok {
		panic("k8s: unknown OME resource " + resource)
	}
	return r
}

// Resource definitions for the kinds the console wires by hand.
var (
	InferenceServiceResource      = MustResource("inferenceservices")
	BaseModelResource             = MustResource("basemodels")
	ClusterBaseModelResource      = MustResource("clusterbasemodels")
	ServingRuntimeResource        = MustResource("servingruntimes")
	ClusterServingRuntimeResource = MustResource("clusterservingruntimes")
	AcceleratorClassResource      = MustResource("acceleratorclasses")
)
