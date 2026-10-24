package k8s

import (
	"context"
	"fmt"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

// Capabilities records which OME resources the connected cluster serves. Discovery runs once at
// startup; installing a CRD later needs a console restart to be picked up.
type Capabilities struct {
	// OMEInstalled is false when the API server does not serve ome.io/v1beta1 at all.
	OMEInstalled bool `json:"omeInstalled"`
	// Resources maps every known OME resource name to whether the cluster serves it.
	Resources map[string]bool `json:"resources"`
	// Features maps console feature flags, derived from Resources, to whether they are available.
	Features map[string]bool `json:"features"`
	// CheckedAt is when discovery ran. It is zero until DiscoverCapabilities has run.
	CheckedAt time.Time `json:"checkedAt"`
}

// Supports reports whether the cluster serves the named OME resource.
func (caps Capabilities) Supports(resource string) bool {
	return caps.Resources[resource]
}

// DiscoverCapabilities asks the API server which OME resources it serves and records the result
// on the client. A cluster without the ome.io/v1beta1 group is reported as OMEInstalled=false
// rather than as an error, so the console can still start and explain what is missing. The
// request is bounded by the discovery client's timeout (DiscoveryTimeout for a real cluster).
func (c *Client) DiscoverCapabilities(ctx context.Context) (Capabilities, error) {
	caps := Capabilities{
		Resources: make(map[string]bool, len(KnownResources)),
		CheckedAt: time.Now(),
	}
	for _, r := range KnownResources {
		caps.Resources[r.Resource] = false
	}

	// The discovery client does not take a context in this client-go version; the parameter
	// keeps the signature stable for callers.
	_ = ctx
	list, err := c.Discovery.ServerResourcesForGroupVersion(OMEGroupVersion)
	switch {
	case err == nil:
		caps.OMEInstalled = true
		served := make(map[string]bool, len(list.APIResources))
		for _, apiResource := range list.APIResources {
			served[apiResource.Name] = true
		}
		for _, r := range KnownResources {
			caps.Resources[r.Resource] = served[r.Resource]
		}
	case apierrors.IsNotFound(err):
		// The group/version is not served: OME is not installed on this cluster.
	default:
		return Capabilities{}, fmt.Errorf("discover %s resources: %w", OMEGroupVersion, err)
	}

	caps.Features = deriveFeatures(caps.Resources)
	c.Capabilities = caps
	return caps, nil
}

// deriveFeatures maps served resources to the console features that need them.
func deriveFeatures(resources map[string]bool) map[string]bool {
	return map[string]bool{
		"omenative":        resources["inferencereplicas"],
		"rolloutPolicy":    resources["rolloutpolicies"],
		"autoscalerPolicy": resources["autoscalerpolicies"],
		"fineTunedWeights": resources["finetunedweights"],
		"benchmarks":       resources["benchmarkjobs"],
		"quota":            resources["acceleratorquotas"],
		"multicluster":     resources["workloadclusters"] && resources["trafficmaps"],
	}
}
