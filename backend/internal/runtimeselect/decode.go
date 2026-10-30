package runtimeselect

import (
	"encoding/json"
	"errors"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// RuntimeFromUnstructured reads the fields selection uses from a ServingRuntime or
// ClusterServingRuntime object. A field that is missing or malformed reads as unset.
func RuntimeFromUnstructured(u *unstructured.Unstructured) Runtime {
	rt := Runtime{
		Ref:         RuntimeRef{Name: u.GetName(), Kind: u.GetKind(), Namespace: u.GetNamespace()},
		InheritFrom: u.GetAnnotations()[AnnotationInheritFrom],
	}
	if rt.Ref.Kind == "" {
		rt.Ref.Kind = KindClusterServingRuntime
		if rt.Ref.Namespace != "" {
			rt.Ref.Kind = KindServingRuntime
		}
	}
	spec := nestedMap(u.Object, "spec")
	rt.Disabled, _, _ = unstructured.NestedBool(spec, "disabled")
	entries, _, _ := unstructured.NestedSlice(spec, "supportedModelFormats")
	for _, raw := range entries {
		if m, ok := raw.(map[string]any); ok {
			rt.Entries = append(rt.Entries, entryFrom(m))
		}
	}
	if r := nestedMap(spec, "modelSizeRange"); r != nil {
		rt.SizeRange = &SizeRange{Min: optionalString(r, "min"), Max: optionalString(r, "max")}
	}
	rt.AcceleratorClasses, _, _ = unstructured.NestedStringSlice(spec, "acceleratorRequirements", "acceleratorClasses")
	rt.EngineMode, _, _ = unstructured.NestedString(spec, "engineConfig", "annotations", AnnotationDeploymentMode)
	rt.DecoderMode, _, _ = unstructured.NestedString(spec, "decoderConfig", "annotations", AnnotationDeploymentMode)
	return rt
}

func entryFrom(m map[string]any) Entry {
	e := Entry{
		Architecture: optionalString(m, "modelArchitecture"),
		Quantization: optionalString(m, "quantization"),
		Priority:     1,
	}
	if f := nestedMap(m, "modelFormat"); f != nil {
		e.Format = versionedFrom(f)
	}
	if f := nestedMap(m, "modelFramework"); f != nil {
		e.Framework = versionedFrom(f)
	}
	if b, found, err := unstructured.NestedBool(m, "autoSelect"); found && err == nil {
		e.AutoSelect = &b
	}
	if p, ok := nestedInt(m, "priority"); ok {
		e.Priority = p
	}
	return e
}

func versionedFrom(m map[string]any) *Versioned {
	v := &Versioned{Version: optionalString(m, "version"), Weight: 1}
	v.Name, _, _ = unstructured.NestedString(m, "name")
	v.Operator, _, _ = unstructured.NestedString(m, "operator")
	if w, ok := nestedInt(m, "weight"); ok {
		v.Weight = w
	}
	return v
}

// ModelFromUnstructured reads the fields selection uses from a BaseModel or ClusterBaseModel
// object; see ModelFromSpec.
func ModelFromUnstructured(u *unstructured.Unstructured) (Model, error) {
	spec := nestedMap(u.Object, "spec")
	if spec == nil {
		return Model{}, errors.New("model has no spec")
	}
	return ModelFromSpec(spec)
}

// ModelFromSpec reads the fields selection uses from a BaseModel spec. It fails when
// spec.modelFormat.name is missing, which OME requires of a model it selects a runtime for; any
// other field that is missing or malformed reads as unset.
func ModelFromSpec(spec map[string]any) (Model, error) {
	name, found, err := unstructured.NestedString(spec, "modelFormat", "name")
	if !found || err != nil || name == "" {
		return Model{}, errors.New("modelFormat.name is required")
	}
	m := Model{
		Format:        Versioned{Name: name, Version: optionalString(spec, "modelFormat", "version")},
		Architecture:  optionalString(spec, "modelArchitecture"),
		Quantization:  optionalString(spec, "quantization"),
		ParameterSize: optionalString(spec, "modelParameterSize"),
	}
	if f := nestedMap(spec, "modelFramework"); f != nil {
		m.Framework = &Versioned{Version: optionalString(f, "version")}
		m.Framework.Name, _, _ = unstructured.NestedString(f, "name")
	}
	return m, nil
}

// nestedMap returns a copy of the map at the path, or nil when there is none.
func nestedMap(m map[string]any, fields ...string) map[string]any {
	v, found, err := unstructured.NestedMap(m, fields...)
	if !found || err != nil {
		return nil
	}
	return v
}

// optionalString returns the string at the path, or nil when it is absent or not a string. An
// empty string is returned as set.
func optionalString(m map[string]any, fields ...string) *string {
	s, found, err := unstructured.NestedString(m, fields...)
	if !found || err != nil {
		return nil
	}
	return &s
}

// nestedInt returns the number at the path. Objects from the API server carry int64 values; a
// request body decoded from JSON carries float64 ones.
func nestedInt(m map[string]any, fields ...string) (int, bool) {
	v, found, err := unstructured.NestedFieldNoCopy(m, fields...)
	if !found || err != nil {
		return 0, false
	}
	switch n := v.(type) {
	case int64:
		return int(n), true
	case int32:
		return int(n), true
	case int:
		return n, true
	case float64:
		return int(n), true
	case json.Number:
		i, err := n.Int64()
		return int(i), err == nil
	}
	return 0, false
}
