// Package runtimeselect reproduces OME's runtime selection for the console: which ServingRuntimes
// and ClusterServingRuntimes can serve a model, why the others cannot, and how OME ranks the ones
// it could pick on its own. It reads the ome.io/v1beta1 objects as unstructured data and follows
// the rules of the OME reference under reference/matching: model version matching, model size
// range matching, accelerator-class and deployment-mode matching, and selection scoring.
package runtimeselect

// Runtime kinds, as RuntimeRef.Kind reports them.
const (
	KindServingRuntime        = "ServingRuntime"
	KindClusterServingRuntime = "ClusterServingRuntime"
)

// Annotations selection reads.
const (
	// AnnotationDeploymentMode declares a component's deployment mode, on a runtime's
	// engineConfig or decoderConfig.
	AnnotationDeploymentMode = "ome.io/deploymentMode"
	// AnnotationInheritFrom names the runtime whose spec a runtime inherits; see Resolve.
	AnnotationInheritFrom = "ome.io/inherit-from"
)

// Deployment modes selection recognizes. Any other value counts as no mode.
const (
	ModeRawDeployment     = "RawDeployment"
	ModeMultiNode         = "MultiNode"
	ModeVirtualDeployment = "VirtualDeployment"
	ModeOMENative         = "OMENative"
)

// Operators of a runtime entry's version. The entry's version stands on the left, so with
// GreaterThanOrEqual it is the newest version the entry accepts. An unset operator is Equal; any
// other value compares as Equal but also requires the same number of parts and the same "v".
const (
	OperatorEqual              = "Equal"
	OperatorGreaterThan        = "GreaterThan"
	OperatorGreaterThanOrEqual = "GreaterThanOrEqual"
)

// RuntimeRef identifies a runtime. Namespace is set for a ServingRuntime only.
type RuntimeRef struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace,omitempty"`
}

// Candidate is the result for one runtime.
type Candidate struct {
	Runtime RuntimeRef `json:"runtime"`
	// Compatible is true when the runtime is enabled, passes the accelerator-class and
	// deployment-mode checks, has an entry that matches the model and accepts the model's size:
	// OME uses it when an InferenceService names it.
	Compatible bool `json:"compatible"`
	// AutoSelect is true when OME could also pick the runtime on its own: it is compatible, one
	// of its entries sets autoSelect: true and its score is above 0.
	AutoSelect bool `json:"autoSelect"`
	// Score is the auto-selection score: the best (format weight + framework weight) × priority
	// over the entries that match the model's format and framework and do not set
	// autoSelect: false. It is 0 unless AutoSelect is true.
	Score int `json:"score"`
	// Reasons say which entry matched, how the score came about, and why OME would not pick a
	// compatible runtime on its own.
	Reasons []string `json:"reasons"`
	// Exclusion is the first rule the runtime failed, in OME's wording; empty when Compatible.
	Exclusion string `json:"exclusion,omitempty"`
}

// Versioned is a model format or framework: a name and an optional version. A version that is
// set but empty still counts as set. On a runtime entry, Operator says how the entry's version
// accepts the model's and Weight is the entry's weight in the score; both are unused on a model.
type Versioned struct {
	Name     string
	Version  *string
	Operator string
	Weight   int
}

// Entry is one spec.supportedModelFormats entry of a runtime.
type Entry struct {
	// Format is the entry's modelFormat. The API requires it; an entry without one never matches.
	Format *Versioned
	// Framework is the entry's modelFramework. The API requires it too.
	Framework *Versioned
	// Architecture and Quantization must be equal to the model's or unset on both sides.
	Architecture *string
	Quantization *string
	// AutoSelect is the entry's autoSelect. Only an entry that sets it to true makes the runtime
	// auto-selectable; an entry that sets it to false is left out of the score, an unset one
	// counts.
	AutoSelect *bool
	// Priority multiplies the entry's weights in the score; 1 when unset.
	Priority int
}

// SizeRange is a runtime's spec.modelSizeRange. Either bound may be unset. The bounds are
// parameter counts such as "500M", "3.21B" or "1.5T"; OME reads a bound it cannot parse as 0.
type SizeRange struct {
	Min *string
	Max *string
}

// Runtime is what selection reads from a ServingRuntime or ClusterServingRuntime.
type Runtime struct {
	Ref RuntimeRef
	// InheritFrom is the ome.io/inherit-from annotation. Auto-selection matches the runtime's own
	// spec and ignores it; Resolve applies it for a named runtime.
	InheritFrom string
	// Disabled is spec.disabled. A disabled runtime is never selected.
	Disabled bool
	// Entries is spec.supportedModelFormats.
	Entries []Entry
	// SizeRange is spec.modelSizeRange; nil when unset.
	SizeRange *SizeRange
	// AcceleratorClasses is spec.acceleratorRequirements.acceleratorClasses.
	AcceleratorClasses []string
	// EngineMode and DecoderMode are the ome.io/deploymentMode annotations of engineConfig and
	// decoderConfig, as written.
	EngineMode  string
	DecoderMode string
}

// Model is what selection reads from a BaseModel or ClusterBaseModel spec.
type Model struct {
	// Format is spec.modelFormat.
	Format Versioned
	// Framework is spec.modelFramework; nil when the model has none, which matches no entry.
	Framework *Versioned
	// Architecture and Quantization are spec.modelArchitecture and spec.quantization.
	Architecture *string
	Quantization *string
	// ParameterSize is spec.modelParameterSize. A model without one passes every size range.
	ParameterSize *string
}

// Request is a model and what an InferenceService adds to selection.
type Request struct {
	Model Model
	// AcceleratorClasses are the classes the InferenceService names, pooled from its
	// ome.io/accelerator-class annotation, spec.acceleratorSelector and the component overrides.
	// A runtime must list every one of them.
	AcceleratorClasses []string
	// EngineMode and DecoderMode are the deployment modes the InferenceService asks for the
	// engine and the decoder, from spec.deploymentMode or the component's annotation. Leave
	// DecoderMode empty when it declares no decoder. A runtime that declares a different mode for
	// the same component is excluded.
	EngineMode  string
	DecoderMode string
}
