package runtimeselect

import "testing"

// The version-presence table of model-version-matching.md, applied to the format and the
// framework, and the case-sensitivity of names.
func TestMatchEntryNamesAndVersions(t *testing.T) {
	entry := func(format, framework *Versioned) Entry {
		return Entry{Format: format, Framework: framework, Priority: 1}
	}
	cases := []struct {
		name   string
		model  Model
		entry  Entry
		want   bool
		reason string
	}{
		{
			name:  "both versions set and equal",
			model: Model{Format: Versioned{Name: "safetensors", Version: str("1.0.0")}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}},
			entry: entry(&Versioned{Name: "safetensors", Version: str("1.0.0")}, &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}),
			want:  true,
		},
		{
			name:  "neither version set",
			model: Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}},
			entry: entry(&Versioned{Name: "safetensors"}, &Versioned{Name: "transformers"}),
			want:  true,
		},
		{
			name:   "model without versions, entry with versions",
			model:  Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}},
			entry:  entry(&Versioned{Name: "safetensors", Version: str("1.0.0")}, &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}),
			reason: "model has no format version but runtime requires 1.0.0, model has no framework version but runtime requires 4.45.0.dev0",
		},
		{
			name:   "model with versions, entry without",
			model:  Model{Format: Versioned{Name: "safetensors", Version: str("1.0.0")}, Framework: &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}},
			entry:  entry(&Versioned{Name: "safetensors"}, &Versioned{Name: "transformers"}),
			reason: "model has format version but runtime has no version requirement, model has framework version but runtime has no version requirement",
		},
		{
			name:   "an empty version counts as set",
			model:  Model{Format: Versioned{Name: "safetensors", Version: str("")}, Framework: &Versioned{Name: "transformers"}},
			entry:  entry(&Versioned{Name: "safetensors"}, &Versioned{Name: "transformers"}),
			reason: "model has format version but runtime has no version requirement",
		},
		{
			name:   "format names are case-sensitive",
			model:  Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}},
			entry:  entry(&Versioned{Name: "SafeTensors"}, &Versioned{Name: "transformers"}),
			reason: "format name mismatch (model=safetensors, runtime=SafeTensors)",
		},
		{
			name:   "framework names differ",
			model:  Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "diffusers"}},
			entry:  entry(&Versioned{Name: "safetensors"}, &Versioned{Name: "transformers"}),
			reason: "framework name mismatch (model=diffusers, runtime=transformers)",
		},
		{
			name:   "versions fail the operator",
			model:  Model{Format: Versioned{Name: "gguf", Version: str("2.0.0")}, Framework: &Versioned{Name: "transformers", Version: str("4.46.0")}},
			entry:  entry(&Versioned{Name: "gguf", Version: str("1.0.0")}, &Versioned{Name: "transformers", Version: str("4.45.0.dev0")}),
			reason: "format version mismatch (model=2.0.0, runtime=1.0.0), framework version mismatch (model=4.46.0, runtime=4.45.0.dev0)",
		},
		{
			name:  "ordering operator accepts an older model version",
			model: Model{Format: Versioned{Name: "safetensors", Version: str("1.0.0")}, Framework: &Versioned{Name: "transformers", Version: str("4.44.2")}},
			entry: entry(&Versioned{Name: "safetensors", Version: str("1.0.0")}, &Versioned{Name: "transformers", Version: str("4.46.0"), Operator: OperatorGreaterThanOrEqual}),
			want:  true,
		},
		{
			name:   "model has no framework",
			model:  Model{Format: Versioned{Name: "safetensors"}},
			entry:  entry(&Versioned{Name: "safetensors"}, &Versioned{Name: "transformers"}),
			reason: "model has no framework but runtime requires transformers",
		},
		{
			name:   "entry has no framework",
			model:  Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}},
			entry:  entry(&Versioned{Name: "safetensors"}, nil),
			reason: "model has framework transformers but runtime has no framework requirement",
		},
		{
			name:  "neither has a framework",
			model: Model{Format: Versioned{Name: "safetensors"}},
			entry: entry(&Versioned{Name: "safetensors"}, nil),
			want:  true,
		},
		{
			name:   "entry has no format",
			model:  Model{Format: Versioned{Name: "safetensors"}},
			entry:  entry(nil, nil),
			reason: "entry has no modelFormat",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ok, reason := matchEntry(tc.model, tc.entry)
			if ok != tc.want || reason != tc.reason {
				t.Fatalf("got ok=%v reason=%q; want ok=%v reason=%q", ok, reason, tc.want, tc.reason)
			}
		})
	}
}

// Architecture and quantization set on one side only are mismatches.
func TestMatchEntryArchitectureAndQuantization(t *testing.T) {
	base := Model{Format: Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}}
	entry := func(arch, quant *string) Entry {
		return Entry{Format: &Versioned{Name: "safetensors"}, Framework: &Versioned{Name: "transformers"}, Architecture: arch, Quantization: quant, Priority: 1}
	}
	cases := []struct {
		name              string
		modelArch, arch   *string
		modelQuant, quant *string
		want              bool
		reason            string
	}{
		{name: "both unset", want: true},
		{name: "equal", modelArch: str("LlamaForCausalLM"), arch: str("LlamaForCausalLM"), modelQuant: str("fp8"), quant: str("fp8"), want: true},
		{name: "architecture differs", modelArch: str("LlamaForCausalLM"), arch: str("MistralForCausalLM"), reason: "architecture mismatch (model=LlamaForCausalLM, runtime=MistralForCausalLM)"},
		{name: "model has no architecture", arch: str("LlamaForCausalLM"), reason: "model has no architecture but runtime requires LlamaForCausalLM"},
		{name: "entry has no architecture", modelArch: str("LlamaForCausalLM"), reason: "model has architecture LlamaForCausalLM but runtime has no architecture requirement"},
		{name: "quantization differs", modelQuant: str("fp8"), quant: str("int4"), reason: "quantization mismatch (model=fp8, runtime=int4)"},
		{name: "model has no quantization", quant: str("fp8"), reason: "model has no quantization but runtime requires fp8"},
		{name: "entry has no quantization", modelQuant: str("fp8"), reason: "model has quantization fp8 but runtime has no quantization requirement"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			model := base
			model.Architecture, model.Quantization = tc.modelArch, tc.modelQuant
			ok, reason := matchEntry(model, entry(tc.arch, tc.quant))
			if ok != tc.want || reason != tc.reason {
				t.Fatalf("got ok=%v reason=%q; want ok=%v reason=%q", ok, reason, tc.want, tc.reason)
			}
		})
	}
}

// The catalog entry of srt-llama-3-2-3b-instruct from model-version-matching.md accepts the
// BaseModel of that page, and gives the documented reason when the model's framework version is
// 4.46.0 instead.
func TestMatchEntryCatalogExample(t *testing.T) {
	entry := Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0"), Weight: 1},
		Framework:    &Versioned{Name: "transformers", Version: str("4.45.0.dev0"), Weight: 1},
		Architecture: str("LlamaForCausalLM"),
		AutoSelect:   boolean(false),
		Priority:     1,
	}
	if ok, reason := matchEntry(llama(), entry); !ok {
		t.Fatalf("expected a match, got %q", reason)
	}
	model := llama()
	model.Framework.Version = str("4.46.0")
	if ok, reason := matchEntry(model, entry); ok || reason != "framework version mismatch (model=4.46.0, runtime=4.45.0.dev0)" {
		t.Fatalf("got ok=%v reason=%q", ok, reason)
	}
	c := Evaluate(clusterRuntime("srt-llama-3-2-3b-instruct", entry), Request{Model: model})
	want := "model format 'mt:safetensors:1.0.0:LlamaForCausalLM:transformers:4.46.0' not in supported formats: framework version mismatch (model=4.46.0, runtime=4.45.0.dev0)"
	if c.Compatible || c.Exclusion != want {
		t.Fatalf("got compatible=%v exclusion=%q", c.Compatible, c.Exclusion)
	}
}

func TestModelLabel(t *testing.T) {
	model := llama()
	model.Quantization = str("fp8")
	if got := modelLabel(model); got != "mt:safetensors:1.0.0:LlamaForCausalLM:fp8:transformers:4.45.0.dev0" {
		t.Fatalf("unexpected label %q", got)
	}
	if got := modelLabel(Model{Format: Versioned{Name: "gguf"}}); got != "mt:gguf" {
		t.Fatalf("unexpected label %q", got)
	}
}

func TestDescribeEntry(t *testing.T) {
	e := Entry{
		Format:       &Versioned{Name: "safetensors", Version: str("1.0.0")},
		Framework:    &Versioned{Name: "transformers", Version: str("4.46.0"), Operator: OperatorGreaterThanOrEqual},
		Architecture: str("LlamaForCausalLM"),
		Quantization: str("fp8"),
	}
	if got := describeEntry(e); got != "safetensors 1.0.0, transformers GreaterThanOrEqual 4.46.0, LlamaForCausalLM, fp8" {
		t.Fatalf("unexpected description %q", got)
	}
	if got := describeEntry(Entry{Format: &Versioned{Name: "gguf"}}); got != "gguf" {
		t.Fatalf("unexpected description %q", got)
	}
}
