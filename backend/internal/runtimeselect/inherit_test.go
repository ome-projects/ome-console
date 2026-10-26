package runtimeselect

import (
	"errors"
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// catalog is a Lookup over a fixed set of runtime objects.
func catalog(objs ...*unstructured.Unstructured) Lookup {
	return func(kind, namespace, name string) (*unstructured.Unstructured, bool, error) {
		for _, u := range objs {
			if u.GetKind() == kind && u.GetNamespace() == namespace && u.GetName() == name {
				return u, true, nil
			}
		}
		return nil, false, nil
	}
}

func runtimeObject(kind, namespace, name, parent string, spec map[string]any) *unstructured.Unstructured {
	u := &unstructured.Unstructured{Object: map[string]any{}}
	u.SetAPIVersion("ome.io/v1beta1")
	u.SetKind(kind)
	u.SetNamespace(namespace)
	u.SetName(name)
	if parent != "" {
		u.SetAnnotations(map[string]string{AnnotationInheritFrom: parent})
	}
	if spec != nil {
		u.Object["spec"] = spec
	}
	return u
}

// The profile and child of runtime-inheritance.md, reduced to the fields selection reads: the
// child inherits the profile's entries and the engine annotations, overrides disabled and one
// bound of the size range, and replaces the accelerator classes.
func TestResolve(t *testing.T) {
	profile := runtimeObject(KindClusterServingRuntime, "", "sglang-profile", "", map[string]any{
		"disabled": true,
		"supportedModelFormats": []any{map[string]any{
			"modelFormat":       map[string]any{"name": "safetensors", "version": "1.0.0"},
			"modelFramework":    map[string]any{"name": "transformers", "version": "4.45.0.dev0"},
			"modelArchitecture": "LlamaForCausalLM",
			"autoSelect":        true,
		}},
		"modelSizeRange":          map[string]any{"min": "1B", "max": "4B"},
		"acceleratorRequirements": map[string]any{"acceleratorClasses": []any{"nvidia-a100"}},
		"engineConfig": map[string]any{
			"annotations": map[string]any{AnnotationDeploymentMode: ModeOMENative, "team": "a"},
			"runner":      map[string]any{"image": "sglang:latest", "command": []any{"python3"}},
		},
	})
	child := runtimeObject(KindServingRuntime, "llama-demo", "llama-3b", "sglang-profile", map[string]any{
		"disabled":                false,
		"modelSizeRange":          map[string]any{"max": "8B"},
		"acceleratorRequirements": map[string]any{"acceleratorClasses": []any{"nvidia-h100"}},
		"engineConfig": map[string]any{
			"annotations": map[string]any{"team": "b"},
			"runner":      map[string]any{"args": []any{"--tp-size", "2"}, "command": nil},
		},
	})
	before := child.DeepCopy()

	resolved, chain, err := Resolve(child, catalog(profile))
	if err != nil {
		t.Fatal(err)
	}
	equalStrings(t, "chain", chain, []string{"sglang-profile", "llama-3b"})
	rt := RuntimeFromUnstructured(resolved)
	if rt.Disabled || len(rt.Entries) != 1 || rt.Entries[0].Format.Name != "safetensors" {
		t.Fatalf("unexpected merged runtime %+v", rt)
	}
	if *rt.SizeRange.Min != "1B" || *rt.SizeRange.Max != "8B" {
		t.Fatalf("unexpected size range %+v", rt.SizeRange)
	}
	equalStrings(t, "classes", rt.AcceleratorClasses, []string{"nvidia-h100"})
	if rt.EngineMode != ModeOMENative {
		t.Fatalf("engine annotations must merge by key: %+v", rt)
	}
	team, _, _ := unstructured.NestedString(resolved.Object, "spec", "engineConfig", "annotations", "team")
	image, _, _ := unstructured.NestedString(resolved.Object, "spec", "engineConfig", "runner", "image")
	command, _, _ := unstructured.NestedStringSlice(resolved.Object, "spec", "engineConfig", "runner", "command")
	if team != "b" || image != "sglang:latest" || len(command) != 1 {
		t.Fatalf("unexpected merged engineConfig: team=%q image=%q command=%v", team, image, command)
	}
	if resolved.GetName() != "llama-3b" || resolved.GetNamespace() != "llama-demo" || resolved.GetAnnotations()[AnnotationInheritFrom] != "sglang-profile" {
		t.Fatalf("metadata must stay the child's: %v", resolved.Object["metadata"])
	}
	if !equalJSON(before, child) {
		t.Fatal("Resolve must not change its input")
	}
	// A child without disabled inherits the profile's disabled: true.
	inheritsDisabled := runtimeObject(KindClusterServingRuntime, "", "still-disabled", "sglang-profile", map[string]any{})
	resolved, _, err = Resolve(inheritsDisabled, catalog(profile))
	if err != nil || !RuntimeFromUnstructured(resolved).Disabled {
		t.Fatalf("expected disabled to be inherited: %v %v", err, resolved)
	}
	// The evaluation of the merged spec differs from the child's own.
	c := Evaluate(RuntimeFromUnstructured(child), Request{Model: llama()})
	if c.Compatible {
		t.Fatalf("the child's own spec has no entries: %+v", c)
	}
	resolved, _, _ = Resolve(child, catalog(profile))
	if c := Evaluate(RuntimeFromUnstructured(resolved), Request{Model: llama()}); !c.AutoSelect {
		t.Fatalf("the merged spec should match: %+v", c)
	}
}

func TestResolveLookupScopes(t *testing.T) {
	clusterParent := runtimeObject(KindClusterServingRuntime, "", "base", "", map[string]any{"modelSizeRange": map[string]any{"min": "1B"}})
	namespacedParent := runtimeObject(KindServingRuntime, "team-a", "base", "", map[string]any{"modelSizeRange": map[string]any{"min": "2B"}})
	child := runtimeObject(KindServingRuntime, "team-a", "child", "base", nil)

	resolved, _, err := Resolve(child, catalog(clusterParent, namespacedParent))
	if err != nil {
		t.Fatal(err)
	}
	if rt := RuntimeFromUnstructured(resolved); *rt.SizeRange.Min != "2B" {
		t.Fatalf("a ServingRuntime's parent is looked up in its namespace first: %+v", rt)
	}
	resolved, _, err = Resolve(child, catalog(clusterParent))
	if err != nil {
		t.Fatal(err)
	}
	if rt := RuntimeFromUnstructured(resolved); *rt.SizeRange.Min != "1B" {
		t.Fatalf("then among the ClusterServingRuntimes: %+v", rt)
	}
	clusterChild := runtimeObject(KindClusterServingRuntime, "", "cluster-child", "base", nil)
	if _, _, err := Resolve(clusterChild, catalog(namespacedParent)); err == nil || !strings.Contains(err.Error(), `inherit-from parent "base" not found`) {
		t.Fatalf("a ClusterServingRuntime's parent must be a ClusterServingRuntime: %v", err)
	}
	// A runtime without the annotation resolves to itself.
	resolved, chain, err := Resolve(clusterParent, catalog())
	if err != nil || len(chain) != 1 || chain[0] != "base" || !equalJSON(resolved, clusterParent) {
		t.Fatalf("unexpected result %v %v %v", resolved, chain, err)
	}
}

func TestResolveErrors(t *testing.T) {
	a := runtimeObject(KindClusterServingRuntime, "", "a", "b", nil)
	b := runtimeObject(KindClusterServingRuntime, "", "b", "a", nil)
	if _, _, err := Resolve(a, catalog(a, b)); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected a cycle error, got %v", err)
	}
	var deep []*unstructured.Unstructured
	for i := 0; i < MaxInheritanceDepth+1; i++ {
		parent := ""
		if i > 0 {
			parent = string(rune('a' + i - 1))
		}
		deep = append(deep, runtimeObject(KindClusterServingRuntime, "", string(rune('a'+i)), parent, nil))
	}
	if _, _, err := Resolve(deep[len(deep)-1], catalog(deep...)); err == nil || !strings.Contains(err.Error(), "max depth") {
		t.Fatalf("expected a depth error, got %v", err)
	}
	if _, _, err := Resolve(deep[MaxInheritanceDepth-1], catalog(deep...)); err != nil {
		t.Fatalf("a chain of %d runtimes must resolve: %v", MaxInheritanceDepth, err)
	}
	failing := func(kind, namespace, name string) (*unstructured.Unstructured, bool, error) {
		return nil, false, errors.New("boom")
	}
	if _, _, err := Resolve(a, failing); err == nil || err.Error() != "boom" {
		t.Fatalf("a lookup error must be returned as is, got %v", err)
	}
}

func equalJSON(a, b *unstructured.Unstructured) bool {
	return strings.TrimSpace(mustJSON(a)) == strings.TrimSpace(mustJSON(b))
}

func mustJSON(u *unstructured.Unstructured) string {
	out, err := u.MarshalJSON()
	if err != nil {
		panic(err)
	}
	return string(out)
}
