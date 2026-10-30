package runtimeselect

import "testing"

// The matching-rule table of runtime-accelerator-class-matching.md.
func TestAcceleratorClasses(t *testing.T) {
	cases := []struct {
		name      string
		requested []string
		listed    []string
		want      bool
	}{
		{"no class, no list", nil, nil, true},
		{"no class, a list", nil, []string{"nvidia-h100"}, true},
		{"class in the list", []string{"nvidia-h100"}, []string{"nvidia-h100", "nvidia-h200"}, true},
		{"class but no list", []string{"nvidia-h100"}, nil, false},
		{"class but an empty list", []string{"nvidia-h100"}, []string{}, false},
		{"class not in the list", []string{"nvidia-a100"}, []string{"nvidia-h100", "nvidia-h200"}, false},
		{"engine and decoder classes both listed", []string{"nvidia-h100", "nvidia-h200"}, []string{"nvidia-h100", "nvidia-h200"}, true},
		{"one of the pooled classes missing", []string{"nvidia-h100", "nvidia-a100"}, []string{"nvidia-h100", "nvidia-h200"}, false},
		{"names match exactly", []string{"NVIDIA-H100"}, []string{"nvidia-h100"}, false},
		{"an empty name is a class no runtime lists", []string{""}, []string{"nvidia-h100"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rt := clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1))
			rt.AcceleratorClasses = tc.listed
			if got := acceleratorsOK(rt, tc.requested); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			c := Evaluate(rt, Request{Model: llama(), AcceleratorClasses: tc.requested})
			if c.Compatible != tc.want {
				t.Fatalf("Evaluate: compatible=%v exclusion=%q", c.Compatible, c.Exclusion)
			}
			if !tc.want && c.Exclusion != "runtime does not support the required accelerator class" {
				t.Fatalf("unexpected exclusion %q", c.Exclusion)
			}
		})
	}
}

// The matching-rule table of runtime-deployment-mode-matching.md, for the engine, plus the
// decoder and the values OME does not recognize.
func TestDeploymentModes(t *testing.T) {
	cases := []struct {
		name                   string
		requested, runtimeMode string
		want                   bool
	}{
		{"none requested, runtime MultiNode", "", ModeMultiNode, true},
		{"OMENative requested, runtime none", ModeOMENative, "", true},
		{"OMENative on both", ModeOMENative, ModeOMENative, true},
		{"OMENative requested, runtime MultiNode", ModeOMENative, ModeMultiNode, false},
		{"RawDeployment requested, runtime OMENative", ModeRawDeployment, ModeOMENative, false},
		{"a misspelled runtime mode counts as none", ModeOMENative, "omenative", true},
		{"a misspelled requested mode counts as none", "Native", ModeMultiNode, true},
	}
	for _, tc := range cases {
		t.Run("engine "+tc.name, func(t *testing.T) {
			rt := clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1))
			rt.EngineMode = tc.runtimeMode
			c := Evaluate(rt, Request{Model: llama(), EngineMode: tc.requested})
			if c.Compatible != tc.want {
				t.Fatalf("compatible=%v exclusion=%q", c.Compatible, c.Exclusion)
			}
			if !tc.want {
				want := "runtime engine deployment mode " + tc.runtimeMode + " does not match requested engine deployment mode " + tc.requested
				if c.Exclusion != want {
					t.Fatalf("exclusion %q, want %q", c.Exclusion, want)
				}
			}
		})
		t.Run("decoder "+tc.name, func(t *testing.T) {
			rt := clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1))
			rt.DecoderMode = tc.runtimeMode
			c := Evaluate(rt, Request{Model: llama(), DecoderMode: tc.requested})
			if c.Compatible != tc.want {
				t.Fatalf("compatible=%v exclusion=%q", c.Compatible, c.Exclusion)
			}
			if !tc.want {
				want := "runtime decoder deployment mode " + tc.runtimeMode + " does not match requested decoder deployment mode " + tc.requested
				if c.Exclusion != want {
					t.Fatalf("exclusion %q, want %q", c.Exclusion, want)
				}
			}
		})
	}
	t.Run("a decoder mode on the runtime does not filter a request without a decoder", func(t *testing.T) {
		rt := clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1))
		rt.DecoderMode = ModeMultiNode
		if c := Evaluate(rt, Request{Model: llama(), EngineMode: ModeOMENative}); !c.Compatible {
			t.Fatalf("exclusion %q", c.Exclusion)
		}
	})
	t.Run("the engine is checked before the decoder", func(t *testing.T) {
		rt := clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1))
		rt.EngineMode, rt.DecoderMode = ModeMultiNode, ModeMultiNode
		c := Evaluate(rt, Request{Model: llama(), EngineMode: ModeOMENative, DecoderMode: ModeOMENative})
		if c.Exclusion != "runtime engine deployment mode MultiNode does not match requested engine deployment mode OMENative" {
			t.Fatalf("exclusion %q", c.Exclusion)
		}
	})
}

// The example of runtime-deployment-mode-matching.md: the MultiNode runtime is skipped for an
// InferenceService that asks for OMENative, with the documented reason.
func TestDeploymentModeExample(t *testing.T) {
	rt := withRange(clusterRuntime("srt-llama-3-3-70b-instruct-multinode", Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0"), Weight: 1},
		Framework:    &Versioned{Name: "transformers", Version: str("4.47.0.dev0"), Weight: 1},
		Architecture: str("LlamaForCausalLM"),
		AutoSelect:   boolean(true),
		Priority:     2,
	}), "60B", "75B")
	rt.EngineMode = ModeMultiNode
	model := Model{
		Format:        Versioned{Name: "safetensors", Version: str("1.0.0")},
		Framework:     &Versioned{Name: "transformers", Version: str("4.47.0.dev0")},
		Architecture:  str("LlamaForCausalLM"),
		ParameterSize: str("70.6B"),
	}
	c := Evaluate(rt, Request{Model: model, EngineMode: ModeOMENative})
	if c.Compatible || c.Exclusion != "runtime engine deployment mode MultiNode does not match requested engine deployment mode OMENative" {
		t.Fatalf("got compatible=%v exclusion=%q", c.Compatible, c.Exclusion)
	}
	if c := Evaluate(rt, Request{Model: model}); !c.AutoSelect || c.Score != 4 {
		t.Fatalf("without a requested mode: %+v", c)
	}
}
