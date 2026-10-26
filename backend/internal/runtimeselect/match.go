package runtimeselect

import (
	"fmt"
	"strings"
)

// matchEntry reports whether the entry accepts the model: the format and framework names must be
// equal (case included), the entry's operators must accept the model's versions, and the
// architecture and the quantization must be equal or unset on both sides. When it does not,
// reason lists every difference in OME's wording, joined by ", ".
func matchEntry(model Model, e Entry) (bool, string) {
	var reasons []string
	reasons = appendOptionalMismatch(reasons, "architecture", model.Architecture, e.Architecture)
	reasons = appendOptionalMismatch(reasons, "quantization", model.Quantization, e.Quantization)

	switch {
	case e.Format == nil:
		reasons = append(reasons, "entry has no modelFormat")
	case e.Format.Name != model.Format.Name:
		reasons = append(reasons, fmt.Sprintf("format name mismatch (model=%s, runtime=%s)", model.Format.Name, e.Format.Name))
	default:
		reasons = appendVersionMismatch(reasons, "format", model.Format, *e.Format)
	}

	switch {
	case e.Framework != nil && model.Framework != nil:
		if e.Framework.Name != model.Framework.Name {
			reasons = append(reasons, fmt.Sprintf("framework name mismatch (model=%s, runtime=%s)", model.Framework.Name, e.Framework.Name))
		} else {
			reasons = appendVersionMismatch(reasons, "framework", *model.Framework, *e.Framework)
		}
	case e.Framework != nil:
		reasons = append(reasons, fmt.Sprintf("model has no framework but runtime requires %s", e.Framework.Name))
	case model.Framework != nil:
		reasons = append(reasons, fmt.Sprintf("model has framework %s but runtime has no framework requirement", model.Framework.Name))
	}
	return len(reasons) == 0, strings.Join(reasons, ", ")
}

// appendOptionalMismatch adds the reason for a field that must be equal or unset on both sides.
func appendOptionalMismatch(reasons []string, field string, modelValue, entryValue *string) []string {
	switch {
	case modelValue != nil && entryValue != nil:
		if *modelValue != *entryValue {
			reasons = append(reasons, fmt.Sprintf("%s mismatch (model=%s, runtime=%s)", field, *modelValue, *entryValue))
		}
	case entryValue != nil:
		reasons = append(reasons, fmt.Sprintf("model has no %s but runtime requires %s", field, *entryValue))
	case modelValue != nil:
		reasons = append(reasons, fmt.Sprintf("model has %s %s but runtime has no %s requirement", field, *modelValue, field))
	}
	return reasons
}

// appendVersionMismatch adds the reason for the versions of a format or framework whose names
// are equal: a version on one side only never matches, and the entry's operator decides when
// both are set.
func appendVersionMismatch(reasons []string, what string, model, entry Versioned) []string {
	switch {
	case model.Version != nil && entry.Version != nil:
		if !versionAccepts(*entry.Version, *model.Version, entry.Operator) {
			reasons = append(reasons, fmt.Sprintf("%s version mismatch (model=%s, runtime=%s)", what, *model.Version, *entry.Version))
		}
	case entry.Version != nil:
		reasons = append(reasons, fmt.Sprintf("model has no %s version but runtime requires %s", what, *entry.Version))
	case model.Version != nil:
		reasons = append(reasons, fmt.Sprintf("model has %s version but runtime has no version requirement", what))
	}
	return reasons
}

// versionsMatch reports whether the entry's version accepts the model's: both unset, or both set
// and accepted by the entry's operator.
func versionsMatch(model, entry Versioned) bool {
	if model.Version != nil && entry.Version != nil {
		return versionAccepts(*entry.Version, *model.Version, entry.Operator)
	}
	return model.Version == nil && entry.Version == nil
}

// formatMatches reports whether the entry's format accepts the model's, name and version included.
func formatMatches(model Model, e Entry) bool {
	return e.Format != nil && e.Format.Name == model.Format.Name && versionsMatch(model.Format, *e.Format)
}

// frameworkMatches reports whether the entry's framework accepts the model's: both unset, or
// both set with equal names and an accepted version.
func frameworkMatches(model Model, e Entry) bool {
	if e.Framework == nil || model.Framework == nil {
		return e.Framework == nil && model.Framework == nil
	}
	return e.Framework.Name == model.Framework.Name && versionsMatch(*model.Framework, *e.Framework)
}

// modelLabel is the "mt:" label OME gives the model in its reasons: the format name and version,
// the architecture, the quantization, and the framework name and version, each when set.
func modelLabel(m Model) string {
	label := "mt:" + m.Format.Name
	if m.Format.Version != nil {
		label += ":" + *m.Format.Version
	}
	if m.Architecture != nil {
		label += ":" + *m.Architecture
	}
	if m.Quantization != nil {
		label += ":" + *m.Quantization
	}
	if m.Framework != nil {
		label += ":" + m.Framework.Name
		if m.Framework.Version != nil {
			label += ":" + *m.Framework.Version
		}
	}
	return label
}

// describeEntry renders an entry for a reason, as in
// "safetensors 1.0.0, transformers GreaterThanOrEqual 4.46.0, LlamaForCausalLM, fp8".
func describeEntry(e Entry) string {
	var parts []string
	if e.Format != nil {
		parts = append(parts, describeVersioned(*e.Format))
	}
	if e.Framework != nil {
		parts = append(parts, describeVersioned(*e.Framework))
	}
	if e.Architecture != nil {
		parts = append(parts, *e.Architecture)
	}
	if e.Quantization != nil {
		parts = append(parts, *e.Quantization)
	}
	return strings.Join(parts, ", ")
}

func describeVersioned(v Versioned) string {
	if v.Version == nil {
		return v.Name
	}
	if v.Operator != "" && v.Operator != OperatorEqual {
		return v.Name + " " + v.Operator + " " + *v.Version
	}
	return v.Name + " " + *v.Version
}
