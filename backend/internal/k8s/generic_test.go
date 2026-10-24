package k8s

import (
	"context"
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
)

func TestPrepareObject(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)

	t.Run("stamps apiVersion, kind and namespace", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "x"}}}
		if err := c.prepareObject(InferenceServiceResource, "team-a", obj); err != nil {
			t.Fatal(err)
		}
		if obj.GetAPIVersion() != OMEGroupVersion || obj.GetKind() != "InferenceService" || obj.GetNamespace() != "team-a" {
			t.Fatalf("unexpected object %v", obj.Object)
		}
	})
	t.Run("rejects a namespace mismatch", func(t *testing.T) {
		obj := newObject("InferenceService", "team-b", "x", "")
		if err := c.prepareObject(InferenceServiceResource, "team-a", obj); !apierrors.IsBadRequest(err) {
			t.Fatalf("expected a BadRequest, got %v", err)
		}
	})
	t.Run("rejects a missing namespace", func(t *testing.T) {
		obj := newObject("InferenceService", "", "x", "")
		if err := c.prepareObject(InferenceServiceResource, "", obj); !apierrors.IsBadRequest(err) {
			t.Fatalf("expected a BadRequest, got %v", err)
		}
	})
	t.Run("rejects a namespace on a cluster-scoped kind", func(t *testing.T) {
		obj := newObject("ClusterBaseModel", "team-a", "x", "")
		if err := c.prepareObject(ClusterBaseModelResource, "", obj); !apierrors.IsBadRequest(err) {
			t.Fatalf("expected a BadRequest, got %v", err)
		}
	})
	t.Run("rejects a nil object", func(t *testing.T) {
		if err := c.prepareObject(ClusterBaseModelResource, "", nil); !apierrors.IsBadRequest(err) {
			t.Fatalf("expected a BadRequest, got %v", err)
		}
	})
}

func TestFieldValidationDefaults(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)
	if got := c.fieldValidation(WriteOptions{}); got != FieldValidationStrict {
		t.Fatalf("default should be Strict, got %q", got)
	}
	c.FieldValidation = FieldValidationWarn
	if got := c.fieldValidation(WriteOptions{}); got != FieldValidationWarn {
		t.Fatalf("client default should win, got %q", got)
	}
	if got := c.fieldValidation(WriteOptions{FieldValidation: FieldValidationIgnore}); got != FieldValidationIgnore {
		t.Fatalf("per-request override should win, got %q", got)
	}
	if got := dryRun(WriteOptions{DryRun: true}); len(got) != 1 || got[0] != "All" {
		t.Fatalf("unexpected dryRun options %v", got)
	}
	if got := dryRun(WriteOptions{}); got != nil {
		t.Fatalf("unexpected dryRun options %v", got)
	}
}

func TestGenericWrites_RoundTrip(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)
	startClient(t, c)
	ctx := context.Background()

	created, err := c.Create(ctx, InferenceServiceResource, "team-a",
		&unstructured.Unstructured{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "llama"}}},
		WriteOptions{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.GetKind() != "InferenceService" || created.GetNamespace() != "team-a" {
		t.Fatalf("unexpected created object %v", created.Object)
	}

	patched, err := c.Patch(ctx, InferenceServiceResource, "team-a", "llama", types.MergePatchType,
		[]byte(`{"metadata":{"labels":{"team":"a"}}}`), WriteOptions{})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if patched.GetLabels()["team"] != "a" {
		t.Fatalf("label not applied: %v", patched.GetLabels())
	}

	patched.SetAnnotations(map[string]string{"note": "x"})
	updated, err := c.Update(ctx, InferenceServiceResource, "team-a", patched, WriteOptions{})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.GetAnnotations()["note"] != "x" {
		t.Fatalf("annotation not applied: %v", updated.GetAnnotations())
	}

	if err := c.Delete(ctx, InferenceServiceResource, "team-a", "llama"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestGenericWrites_RefuseUnsupportedResources(t *testing.T) {
	c, _ := newTestClient(t, coreResourceNames)
	startClient(t, c)
	rolloutPolicies := MustResource("rolloutpolicies")

	_, err := c.Create(context.Background(), rolloutPolicies, "team-a", newObject("RolloutPolicy", "", "p", ""), WriteOptions{})
	if !errors.Is(err, ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported, got %v", err)
	}
	if err := c.Delete(context.Background(), rolloutPolicies, "team-a", "p"); !errors.Is(err, ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported from Delete, got %v", err)
	}
}
