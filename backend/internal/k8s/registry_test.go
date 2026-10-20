package k8s

import "testing"

func TestKnownResources_AreConsistent(t *testing.T) {
	seen := map[string]bool{}
	keyScopes := map[string]map[bool]bool{}
	for _, r := range KnownResources {
		if r.Resource == "" || r.Kind == "" || r.Key == "" {
			t.Errorf("incomplete resource definition: %+v", r)
		}
		if seen[r.Resource] {
			t.Errorf("duplicate resource %s", r.Resource)
		}
		seen[r.Resource] = true
		if keyScopes[r.Key] == nil {
			keyScopes[r.Key] = map[bool]bool{}
		}
		if keyScopes[r.Key][r.Namespaced] {
			t.Errorf("key %s has two %v definitions", r.Key, r.Namespaced)
		}
		keyScopes[r.Key][r.Namespaced] = true
		if got := r.GVR(); got.Group != OMEGroup || got.Version != OMEVersion || got.Resource != r.Resource {
			t.Errorf("unexpected GVR %v for %s", got, r.Resource)
		}
		if r.ListKind() != r.Kind+"List" {
			t.Errorf("unexpected list kind %s", r.ListKind())
		}
	}

	if _, ok := ResourceByName("inferenceservices"); !ok {
		t.Error("inferenceservices must be known")
	}
	if _, ok := ResourceByName("nope"); ok {
		t.Error("unknown resources must not resolve")
	}
	if InferenceServiceResource.Key != "services" || !InferenceServiceResource.Namespaced {
		t.Errorf("unexpected InferenceService definition: %+v", InferenceServiceResource)
	}
	if ClusterBaseModelResource.Key != BaseModelResource.Key {
		t.Error("the two model scopes must share a key")
	}
}

func TestMustResource_PanicsOnUnknown(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic for an unknown resource")
		}
	}()
	MustResource("nope")
}
