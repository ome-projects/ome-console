package k8s

import (
	"context"
	"testing"
)

func TestDiscoverCapabilities_ReportsServedResources(t *testing.T) {
	c, _ := newTestClient(t, append(coreResourceNames, "inferencereplicas", "rolloutpolicies"))

	caps, err := c.DiscoverCapabilities(context.Background())
	if err != nil {
		t.Fatalf("DiscoverCapabilities returned error: %v", err)
	}

	if !caps.OMEInstalled {
		t.Fatal("expected OMEInstalled to be true")
	}
	if caps.CheckedAt.IsZero() {
		t.Fatal("expected CheckedAt to be set")
	}
	for _, name := range []string{"inferenceservices", "clusterbasemodels", "inferencereplicas", "rolloutpolicies"} {
		if !caps.Supports(name) {
			t.Errorf("expected %s to be supported", name)
		}
	}
	for _, name := range []string{"autoscalerpolicies", "workloadclusters", "trafficmaps", "acceleratorquotas"} {
		if caps.Supports(name) {
			t.Errorf("expected %s to be unsupported", name)
		}
	}
	if len(caps.Resources) != len(KnownResources) {
		t.Errorf("expected every known resource to be reported, got %d of %d", len(caps.Resources), len(KnownResources))
	}

	want := map[string]bool{
		"omenative": true, "rolloutPolicy": true,
		"autoscalerPolicy": false, "fineTunedWeights": false, "benchmarks": false, "quota": false, "multicluster": false,
	}
	for feature, expected := range want {
		if caps.Features[feature] != expected {
			t.Errorf("feature %s: got %v, want %v", feature, caps.Features[feature], expected)
		}
	}
	if c.Capabilities.CheckedAt != caps.CheckedAt {
		t.Error("expected the result to be recorded on the client")
	}
}

func TestDiscoverCapabilities_MulticlusterNeedsBothResources(t *testing.T) {
	c, _ := newTestClient(t, append(coreResourceNames, "workloadclusters"))

	caps, err := c.DiscoverCapabilities(context.Background())
	if err != nil {
		t.Fatalf("DiscoverCapabilities returned error: %v", err)
	}
	if caps.Features["multicluster"] {
		t.Error("multicluster must stay off without trafficmaps")
	}
}

func TestDiscoverCapabilities_OMENotInstalled(t *testing.T) {
	c, _ := newTestClient(t, nil)

	caps, err := c.DiscoverCapabilities(context.Background())
	if err != nil {
		t.Fatalf("a cluster without OME must not be an error, got: %v", err)
	}
	if caps.OMEInstalled {
		t.Fatal("expected OMEInstalled to be false")
	}
	for name, supported := range caps.Resources {
		if supported {
			t.Errorf("expected %s to be unsupported", name)
		}
	}
	for feature, enabled := range caps.Features {
		if enabled {
			t.Errorf("expected feature %s to be disabled", feature)
		}
	}
}

func TestSetupInformers_RequiresDiscovery(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)

	if err := c.SetupInformers(); err == nil {
		t.Fatal("expected SetupInformers to fail before DiscoverCapabilities")
	}
}
