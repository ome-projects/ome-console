package runtimeselect

import (
	"encoding/json"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func object(t *testing.T, doc string) *unstructured.Unstructured {
	t.Helper()
	u := &unstructured.Unstructured{}
	if err := json.Unmarshal([]byte(doc), &u.Object); err != nil {
		t.Fatal(err)
	}
	return u
}

func TestRuntimeFromUnstructured(t *testing.T) {
	// Numbers decoded from JSON are float64; objects from the API server carry int64.
	u := object(t, `{
	  "apiVersion": "ome.io/v1beta1", "kind": "ServingRuntime",
	  "metadata": {"name": "team-llama", "namespace": "llama-demo", "annotations": {"ome.io/inherit-from": "sglang-profile"}},
	  "spec": {
	    "disabled": true,
	    "supportedModelFormats": [
	      {"modelFormat": {"name": "safetensors", "version": "1.0.0", "weight": 2},
	       "modelFramework": {"name": "transformers", "version": "", "operator": "GreaterThanOrEqual", "weight": 0},
	       "modelArchitecture": "LlamaForCausalLM", "quantization": "fp8", "autoSelect": true, "priority": 3},
	      {"modelFormat": {"name": "gguf"}, "modelFramework": {"name": "llama.cpp"}, "autoSelect": false},
	      {"modelFormat": {"name": "onnx"}}
	    ],
	    "modelSizeRange": {"min": "2B"},
	    "acceleratorRequirements": {"acceleratorClasses": ["nvidia-h100", "nvidia-h200"]},
	    "engineConfig": {"annotations": {"ome.io/deploymentMode": "OMENative"}},
	    "decoderConfig": {"annotations": {"ome.io/deploymentMode": "MultiNode"}}
	  }
	}`)
	rt := RuntimeFromUnstructured(u)
	if rt.Ref != (RuntimeRef{Name: "team-llama", Kind: KindServingRuntime, Namespace: "llama-demo"}) {
		t.Fatalf("unexpected ref %+v", rt.Ref)
	}
	if rt.InheritFrom != "sglang-profile" || !rt.Disabled || rt.EngineMode != "OMENative" || rt.DecoderMode != "MultiNode" {
		t.Fatalf("unexpected runtime %+v", rt)
	}
	if rt.SizeRange == nil || rt.SizeRange.Min == nil || *rt.SizeRange.Min != "2B" || rt.SizeRange.Max != nil {
		t.Fatalf("unexpected size range %+v", rt.SizeRange)
	}
	equalStrings(t, "classes", rt.AcceleratorClasses, []string{"nvidia-h100", "nvidia-h200"})
	if len(rt.Entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(rt.Entries))
	}
	e := rt.Entries[0]
	if e.Format.Name != "safetensors" || *e.Format.Version != "1.0.0" || e.Format.Weight != 2 || e.Format.Operator != "" {
		t.Fatalf("unexpected format %+v", e.Format)
	}
	if e.Framework.Name != "transformers" || e.Framework.Version == nil || *e.Framework.Version != "" ||
		e.Framework.Operator != OperatorGreaterThanOrEqual || e.Framework.Weight != 0 {
		t.Fatalf("unexpected framework %+v", e.Framework)
	}
	if *e.Architecture != "LlamaForCausalLM" || *e.Quantization != "fp8" || e.AutoSelect == nil || !*e.AutoSelect || e.Priority != 3 {
		t.Fatalf("unexpected entry %+v", e)
	}
	e = rt.Entries[1]
	if e.Format.Version != nil || e.Format.Weight != 1 || e.AutoSelect == nil || *e.AutoSelect || e.Priority != 1 || e.Architecture != nil {
		t.Fatalf("unexpected entry %+v", e)
	}
	if e = rt.Entries[2]; e.Framework != nil || e.AutoSelect != nil {
		t.Fatalf("unexpected entry %+v", e)
	}

	// int64 numbers and an object without a kind.
	u = &unstructured.Unstructured{Object: map[string]any{
		"metadata": map[string]any{"name": "csr"},
		"spec": map[string]any{
			"supportedModelFormats": []any{map[string]any{
				"modelFormat": map[string]any{"name": "safetensors", "weight": int64(0)},
				"priority":    int64(2),
			}},
		},
	}}
	rt = RuntimeFromUnstructured(u)
	if rt.Ref.Kind != KindClusterServingRuntime || rt.Entries[0].Format.Weight != 0 || rt.Entries[0].Priority != 2 {
		t.Fatalf("unexpected runtime %+v", rt)
	}
	if rt := RuntimeFromUnstructured(&unstructured.Unstructured{Object: map[string]any{"metadata": map[string]any{"name": "x", "namespace": "ns"}}}); rt.Ref.Kind != KindServingRuntime || rt.Entries != nil || rt.SizeRange != nil {
		t.Fatalf("unexpected runtime %+v", rt)
	}
}

func TestModelFromSpec(t *testing.T) {
	u := object(t, `{"kind": "BaseModel", "metadata": {"name": "llama-3-2-3b-instruct", "namespace": "llama-demo"}, "spec": {
	  "modelType": "llama", "modelArchitecture": "LlamaForCausalLM",
	  "modelFormat": {"name": "safetensors", "version": "1.0.0"},
	  "modelFramework": {"name": "transformers", "version": "4.45.0.dev0"},
	  "modelParameterSize": "3.21B", "quantization": "fp8"
	}}`)
	m, err := ModelFromUnstructured(u)
	if err != nil {
		t.Fatal(err)
	}
	want := llama()
	want.Quantization = str("fp8")
	if modelLabel(m) != modelLabel(want) || *m.ParameterSize != "3.21B" {
		t.Fatalf("unexpected model %+v", m)
	}

	m, err = ModelFromSpec(map[string]any{"modelFormat": map[string]any{"name": "gguf"}})
	if err != nil || m.Framework != nil || m.Format.Version != nil || m.ParameterSize != nil || m.Architecture != nil {
		t.Fatalf("unexpected model %+v, %v", m, err)
	}
	for _, spec := range []map[string]any{
		nil,
		{},
		{"modelFormat": map[string]any{"version": "1.0.0"}},
		{"modelFormat": map[string]any{"name": ""}},
		{"modelFormat": "safetensors"},
	} {
		if _, err := ModelFromSpec(spec); err == nil {
			t.Fatalf("expected an error for %v", spec)
		}
	}
	if _, err := ModelFromUnstructured(&unstructured.Unstructured{Object: map[string]any{"metadata": map[string]any{"name": "x"}}}); err == nil {
		t.Fatal("expected an error for a model without a spec")
	}
}
