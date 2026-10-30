package runtimeselect

import (
	"strings"
	"testing"
)

// The worked example of runtime-selection-scoring.md, and the change of priority it describes.
func TestExplainWorkedExample(t *testing.T) {
	ranked := Explain(scoringExample(), Request{Model: llama()})
	equalStrings(t, "ranking", names(ranked), []string{"team-llama", "vllm-llama", "srt-llama-small", "srt-llama-large"})
	for _, c := range ranked {
		if !c.Compatible || !c.AutoSelect || c.Exclusion != "" {
			t.Fatalf("%s should be auto-selectable: %+v", c.Runtime.Name, c)
		}
	}
	wantScores := map[string]int{"team-llama": 2, "vllm-llama": 6, "srt-llama-small": 6, "srt-llama-large": 6}
	for _, c := range ranked {
		if c.Score != wantScores[c.Runtime.Name] {
			t.Fatalf("%s: score %d, want %d", c.Runtime.Name, c.Score, wantScores[c.Runtime.Name])
		}
	}
	if ranked[1].Reasons[len(ranked[1].Reasons)-1] != "score 6 = (2 + 1) * 2 from supportedModelFormats[0]" {
		t.Fatalf("unexpected score reason %v", ranked[1].Reasons)
	}

	// Raising srt-llama-small's priority to 4 puts it first among the ClusterServingRuntimes,
	// but team-llama still wins in llama-demo.
	runtimes := scoringExample()
	runtimes[1].Entries[0].Priority = 4
	ranked = Explain(runtimes, Request{Model: llama()})
	equalStrings(t, "ranking", names(ranked), []string{"team-llama", "srt-llama-small", "vllm-llama", "srt-llama-large"})
	if ranked[1].Score != 8 {
		t.Fatalf("srt-llama-small should score 8, got %d", ranked[1].Score)
	}
}

func TestExplainTieBreaks(t *testing.T) {
	t.Run("names order equal runtimes", func(t *testing.T) {
		ranked := Explain([]Runtime{
			clusterRuntime("runtime-b", llamaEntry(boolean(true), 1, 1, 1)),
			clusterRuntime("runtime-a", llamaEntry(boolean(true), 1, 1, 1)),
		}, Request{Model: llama()})
		equalStrings(t, "ranking", names(ranked), []string{"runtime-a", "runtime-b"})
	})
	t.Run("a range with one bound counts the distance to that bound", func(t *testing.T) {
		ranked := Explain([]Runtime{
			withRange(clusterRuntime("wide", llamaEntry(boolean(true), 1, 1, 1)), "1B", "70B"),
			withRange(clusterRuntime("open", llamaEntry(boolean(true), 1, 1, 1)), "1B", ""),
		}, Request{Model: llama()})
		equalStrings(t, "ranking", names(ranked), []string{"open", "wide"})
	})
	t.Run("without a model size the ranges do not count", func(t *testing.T) {
		model := llama()
		model.ParameterSize = nil
		ranked := Explain([]Runtime{
			withRange(clusterRuntime("b", llamaEntry(boolean(true), 1, 1, 1)), "1B", "70B"),
			clusterRuntime("a", llamaEntry(boolean(true), 1, 1, 1)),
			withRange(clusterRuntime("c", llamaEntry(boolean(true), 1, 1, 1)), "1B", "8B"),
		}, Request{Model: model})
		equalStrings(t, "ranking", names(ranked), []string{"a", "b", "c"})
	})
}

// Compatible runtimes OME would not pick on its own, and excluded ones, follow the ranking with
// the reasons kubectl ome runtime explain gives.
func TestExplainGroups(t *testing.T) {
	disabled := clusterRuntime("disabled", llamaEntry(boolean(true), 9, 1, 1))
	disabled.Disabled = true
	noAutoSelect := namespacedRuntime("llama-demo", "named-only", llamaEntry(boolean(false), 9, 1, 1))
	otherEntry := clusterRuntime("other-entry",
		llamaEntry(boolean(false), 1, 1, 1),
		Entry{Format: &Versioned{Name: "gguf"}, Framework: &Versioned{Name: "transformers"}, AutoSelect: boolean(true), Priority: 1},
	)
	negative := clusterRuntime("negative", llamaEntry(boolean(true), 1, -5, 1))
	tooSmall := withRange(clusterRuntime("srt-llama-3-2-1b-instruct", llamaEntry(boolean(true), 1, 1, 1)), "500M", "2B")
	wrongModel := clusterRuntime("mistral", Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0")},
		Framework:    &Versioned{Name: "transformers", Version: str("4.45.0.dev0")},
		Architecture: str("MistralForCausalLM"),
		AutoSelect:   boolean(true),
		Priority:     1,
	})
	empty := clusterRuntime("empty")
	runtimes := append([]Runtime{disabled, noAutoSelect, otherEntry, negative, tooSmall, wrongModel, empty}, scoringExample()...)

	ranked := Explain(runtimes, Request{Model: llama()})
	equalStrings(t, "ranking", names(ranked), []string{
		"team-llama", "vllm-llama", "srt-llama-small", "srt-llama-large",
		"named-only", "negative", "other-entry",
		"disabled", "empty", "mistral", "srt-llama-3-2-1b-instruct",
	})
	byName := map[string]Candidate{}
	for _, c := range ranked {
		byName[c.Runtime.Name] = c
	}
	wantReason := map[string]string{
		"named-only":  "supports the model but has no supportedModelFormats[].autoSelect=true entry, so automatic selection skips it (pin it explicitly via spec.runtime.name instead)",
		"other-entry": "matching format safetensors is not autoSelect-enabled (a different supportedModelFormats entry on this runtime has autoSelect=true, but not the one that matches this model)",
		"negative":    "auto-select score is 0",
	}
	for name, want := range wantReason {
		c := byName[name]
		if !c.Compatible || c.AutoSelect || c.Score != 0 || c.Exclusion != "" {
			t.Fatalf("%s: %+v", name, c)
		}
		if last := c.Reasons[len(c.Reasons)-1]; last != want {
			t.Fatalf("%s: last reason %q, want %q", name, last, want)
		}
	}
	wantExclusion := map[string]string{
		"disabled":                  "runtime is disabled",
		"empty":                     "model format 'mt:safetensors:1.0.0:LlamaForCausalLM:transformers:4.45.0.dev0' not in supported formats: no supported formats defined",
		"mistral":                   "model format 'mt:safetensors:1.0.0:LlamaForCausalLM:transformers:4.45.0.dev0' not in supported formats: architecture mismatch (model=LlamaForCausalLM, runtime=MistralForCausalLM)",
		"srt-llama-3-2-1b-instruct": "model size 3.21B is outside supported range [500M, 2B]",
	}
	for name, want := range wantExclusion {
		c := byName[name]
		if c.Compatible || c.AutoSelect || c.Exclusion != want {
			t.Fatalf("%s: %+v", name, c)
		}
	}
}

func TestEvaluateReasons(t *testing.T) {
	rt := withRange(clusterRuntime("rt", llamaEntry(boolean(true), 1, 1, 1)), "2B", "4B")
	rt.AcceleratorClasses = []string{"nvidia-h100", "nvidia-h200"}
	rt.EngineMode = ModeOMENative
	rt.InheritFrom = "sglang-profile"
	c := Evaluate(rt, Request{Model: llama(), AcceleratorClasses: []string{"nvidia-h100"}, EngineMode: ModeOMENative})
	if !c.AutoSelect {
		t.Fatalf("expected auto-selectable: %+v", c)
	}
	equalStrings(t, "reasons", c.Reasons, []string{
		"supportedModelFormats[0] matches: safetensors 1.0.0, transformers 4.45.0.dev0, LlamaForCausalLM",
		"model size 3.21B is within [2B, 4B]",
		"lists the requested accelerator classes: nvidia-h100",
		"engine deployment mode OMENative matches the request",
		"inherits from sglang-profile; the merged spec applies only when an InferenceService names this runtime",
		"score 2 = (1 + 1) * 1 from supportedModelFormats[0]",
	})
}

// The checks run in OME's order, so the exclusion names the first one failed.
func TestEvaluateCheckOrder(t *testing.T) {
	rt := withRange(clusterRuntime("rt", Entry{Format: &Versioned{Name: "gguf"}, Framework: &Versioned{Name: "transformers"}, Priority: 1}), "500M", "2B")
	rt.Disabled = true
	rt.EngineMode = ModeMultiNode
	req := Request{Model: llama(), AcceleratorClasses: []string{"nvidia-h100"}, EngineMode: ModeOMENative}

	steps := []struct {
		fix  func()
		want string
	}{
		{func() {}, "runtime is disabled"},
		{func() { rt.Disabled = false }, "runtime does not support the required accelerator class"},
		{func() { rt.AcceleratorClasses = []string{"nvidia-h100"} }, "runtime engine deployment mode MultiNode does not match requested engine deployment mode OMENative"},
		{func() { rt.EngineMode = "" }, "model format 'mt:"},
		{func() { rt.Entries = []Entry{llamaEntry(boolean(true), 1, 1, 1)} }, "model size 3.21B is outside supported range [500M, 2B]"},
		{func() { rt.SizeRange = nil }, ""},
	}
	for _, step := range steps {
		step.fix()
		c := Evaluate(rt, req)
		if !strings.HasPrefix(c.Exclusion, step.want) || (step.want == "") != c.Compatible {
			t.Fatalf("after fix: exclusion %q, want prefix %q", c.Exclusion, step.want)
		}
	}
}

// The example of runtime-accelerator-class-matching.md.
func TestAcceleratorClassExample(t *testing.T) {
	hopper := withRange(clusterRuntime("llama-3-3-70b-hopper", Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0"), Weight: 1},
		Framework:    &Versioned{Name: "transformers", Version: str("4.47.0.dev0"), Weight: 1},
		Architecture: str("LlamaForCausalLM"),
		AutoSelect:   boolean(true),
		Priority:     1,
	}), "60B", "75B")
	hopper.AcceleratorClasses = []string{"nvidia-h100", "nvidia-h200"}
	model := Model{
		Format:        Versioned{Name: "safetensors", Version: str("1.0.0")},
		Framework:     &Versioned{Name: "transformers", Version: str("4.47.0.dev0")},
		Architecture:  str("LlamaForCausalLM"),
		ParameterSize: str("70.6B"),
	}
	if c := Evaluate(hopper, Request{Model: model, AcceleratorClasses: []string{"nvidia-h100"}}); !c.AutoSelect {
		t.Fatalf("expected llama-3-3-70b-hopper to be selected: %+v", c)
	}
	c := Evaluate(hopper, Request{Model: model, AcceleratorClasses: []string{"nvidia-a100"}})
	if c.Compatible || c.Exclusion != "runtime does not support the required accelerator class" {
		t.Fatalf("unexpected result %+v", c)
	}
}
