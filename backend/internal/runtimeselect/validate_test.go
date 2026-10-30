package runtimeselect

import (
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	t.Run("a catalog runtime passes with a warning about auto-selection", func(t *testing.T) {
		rt := withRange(clusterRuntime("srt-llama-3-2-3b-instruct", llamaEntry(boolean(false), 1, 1, 1)), "2B", "4B")
		errs, warnings := Validate(rt)
		if len(errs) != 0 {
			t.Fatalf("unexpected errors %v", errs)
		}
		equalStrings(t, "warnings", warnings, []string{"no entry sets autoSelect: true, so OME uses the runtime only when an InferenceService names it"})
	})
	t.Run("missing names and a bad priority are errors", func(t *testing.T) {
		errs, _ := Validate(clusterRuntime("rt", Entry{Format: &Versioned{Name: ""}, Priority: 0}, Entry{Format: &Versioned{Name: "gguf"}, Framework: &Versioned{Name: "llama.cpp"}, AutoSelect: boolean(true), Priority: 1}))
		equalStrings(t, "errors", errs, []string{
			"supportedModelFormats[0]: modelFormat.name is required",
			"supportedModelFormats[0]: modelFramework.name is required",
			"supportedModelFormats[0]: priority must be at least 1",
		})
	})
	t.Run("what OME reads differently is a warning", func(t *testing.T) {
		rt := withRange(clusterRuntime("rt", Entry{
			Format:     &Versioned{Name: "safetensors", Version: str("1.08.0"), Operator: "LessThan"},
			Framework:  &Versioned{Name: "transformers", Version: str("4.45.0.dev0")},
			AutoSelect: boolean(true),
			Priority:   1,
		}), "4B", "2b")
		rt.Disabled = true
		rt.EngineMode = "omenative"
		errs, warnings := Validate(rt)
		if len(errs) != 0 {
			t.Fatalf("unexpected errors %v", errs)
		}
		wantPrefixes := []string{
			`supportedModelFormats[0]: modelFormat.version "1.08.0" does not parse`,
			`supportedModelFormats[0]: modelFormat.operator "LessThan" is not Equal`,
			"disabled: true: OME never selects the runtime",
			`modelSizeRange.max "2b" is not a parameter count`,
			"modelSizeRange min 4B is above max 2b",
			`engineConfig annotation ome.io/deploymentMode "omenative" is not a deployment mode`,
		}
		if len(warnings) != len(wantPrefixes) {
			t.Fatalf("got %d warnings %v, want %d", len(warnings), warnings, len(wantPrefixes))
		}
		for i, prefix := range wantPrefixes {
			if !strings.HasPrefix(warnings[i], prefix) {
				t.Fatalf("warning %d = %q, want prefix %q", i, warnings[i], prefix)
			}
		}
	})
	t.Run("no entries", func(t *testing.T) {
		errs, warnings := Validate(clusterRuntime("rt"))
		if len(errs) != 0 || len(warnings) != 1 || !strings.HasPrefix(warnings[0], "no supportedModelFormats entry") {
			t.Fatalf("got %v %v", errs, warnings)
		}
	})
}
