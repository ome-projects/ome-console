package runtimeselect

import (
	"testing"
)

func str(v string) *string { return &v }

func boolean(v bool) *bool { return &v }

// llama is the BaseModel llama-3-2-3b-instruct from the OME docs: safetensors 1.0.0, transformers
// 4.45.0.dev0, LlamaForCausalLM, 3.21B parameters.
func llama() Model {
	return Model{
		Format:        Versioned{Name: "safetensors", Version: str("1.0.0")},
		Framework:     &Versioned{Name: "transformers", Version: str("4.45.0.dev0")},
		Architecture:  str("LlamaForCausalLM"),
		ParameterSize: str("3.21B"),
	}
}

// llamaEntry is an entry that matches llama. autoSelect, priority and weights are the caller's.
func llamaEntry(autoSelect *bool, priority, formatWeight, frameworkWeight int) Entry {
	return Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0"), Weight: formatWeight},
		Framework:    &Versioned{Name: "transformers", Version: str("4.45.0.dev0"), Weight: frameworkWeight},
		Architecture: str("LlamaForCausalLM"),
		AutoSelect:   autoSelect,
		Priority:     priority,
	}
}

func clusterRuntime(name string, entries ...Entry) Runtime {
	return Runtime{Ref: RuntimeRef{Name: name, Kind: KindClusterServingRuntime}, Entries: entries}
}

func namespacedRuntime(namespace, name string, entries ...Entry) Runtime {
	return Runtime{Ref: RuntimeRef{Name: name, Kind: KindServingRuntime, Namespace: namespace}, Entries: entries}
}

func withRange(rt Runtime, minSize, maxSize string) Runtime {
	rt.SizeRange = &SizeRange{}
	if minSize != "" {
		rt.SizeRange.Min = str(minSize)
	}
	if maxSize != "" {
		rt.SizeRange.Max = str(maxSize)
	}
	return rt
}

// scoringExample is the cluster of the worked example in runtime-selection-scoring.md: four
// runtimes, each with one entry that matches llama and sets autoSelect: true.
func scoringExample() []Runtime {
	return []Runtime{
		withRange(clusterRuntime("srt-llama-large", llamaEntry(boolean(true), 3, 1, 1)), "1B", "70B"),
		withRange(clusterRuntime("srt-llama-small", llamaEntry(boolean(true), 3, 1, 1)), "1B", "8B"),
		clusterRuntime("vllm-llama", llamaEntry(boolean(true), 2, 2, 1)),
		namespacedRuntime("llama-demo", "team-llama", llamaEntry(boolean(true), 1, 1, 1)),
	}
}

func names(candidates []Candidate) []string {
	out := make([]string, len(candidates))
	for i, c := range candidates {
		out[i] = c.Runtime.Name
	}
	return out
}

func equalStrings(t *testing.T, what string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s: got %v, want %v", what, got, want)
		}
	}
}
