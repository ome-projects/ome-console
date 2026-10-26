package runtimeselect

import "testing"

// The score table and the vllm-llama entry of runtime-selection-scoring.md.
func TestEntryScore(t *testing.T) {
	cases := []struct {
		name  string
		entry Entry
		want  int
	}{
		{"(2 + 1) × 2 = 6", llamaEntry(boolean(true), 2, 2, 1), 6},
		{"defaults: (1 + 1) × 1 = 2", llamaEntry(nil, 1, 1, 1), 2},
		{"weight 0 counts as 10 and 5", llamaEntry(boolean(true), 1, 0, 0), 15},
		{"format weight 0 only", llamaEntry(boolean(true), 3, 0, 1), 33},
		{"a negative weight lowers the score", llamaEntry(boolean(true), 2, -1, 1), 0},
		{"priority multiplies", llamaEntry(boolean(true), 4, 1, 1), 8},
		{"an entry whose names do not match scores 0", Entry{Format: &Versioned{Name: "gguf"}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}, Priority: 5}, 0},
		{"versions are part of the match", Entry{Format: &Versioned{Name: "safetensors", Version: str("2.0.0")}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}, Priority: 5}, 0},
		{"a version on one side only does not match", Entry{Format: &Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}, Priority: 5}, 0},
		{"the architecture does not count", Entry{Format: &Versioned{Name: "safetensors", Version: str("1.0.0"), Weight: 1}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0"), Weight: 1}, Architecture: str("MistralForCausalLM"), Priority: 1}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := entryScore(llama(), tc.entry); got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
	t.Run("an entry without a framework scores the format alone", func(t *testing.T) {
		model := Model{Format: Versioned{Name: "gguf"}}
		if got := entryScore(model, Entry{Format: &Versioned{Name: "gguf", Weight: 3}, Priority: 2}); got != 6 {
			t.Fatalf("got %d, want 6", got)
		}
	})
}

func TestBestScore(t *testing.T) {
	rt := clusterRuntime("rt",
		llamaEntry(boolean(false), 9, 1, 1), // left out of the score
		llamaEntry(nil, 2, 1, 1),            // counts: unset autoSelect
		llamaEntry(boolean(true), 3, 1, 1),  // the best
		Entry{Format: &Versioned{Name: "gguf"}, Framework: &Versioned{Name: "transformers"}, AutoSelect: boolean(true), Priority: 50},
	)
	score, index := bestScore(llama(), rt)
	if score != 6 || index != 2 {
		t.Fatalf("got score=%d index=%d, want 6 and 2", score, index)
	}
	none := clusterRuntime("rt", llamaEntry(boolean(false), 1, 1, 1))
	if score, index := bestScore(llama(), none); score != 0 || index != -1 {
		t.Fatalf("got score=%d index=%d, want 0 and -1", score, index)
	}
	if got := scoreReason(6, 2, rt.Entries[2]); got != "score 6 = (1 + 1) * 3 from supportedModelFormats[2]" {
		t.Fatalf("unexpected reason %q", got)
	}
}
