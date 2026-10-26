package runtimeselect

import "fmt"

// Validate checks a runtime against the selection rules and reports what keeps it from matching
// models: errors for what the API rejects or what can never match, warnings for what limits the
// runtime or what OME reads differently from how it is written.
func Validate(rt Runtime) (errs, warnings []string) {
	if len(rt.Entries) == 0 {
		warnings = append(warnings, "no supportedModelFormats entry: the runtime matches no model")
	}
	for i, e := range rt.Entries {
		if e.Format == nil || e.Format.Name == "" {
			errs = append(errs, fmt.Sprintf("supportedModelFormats[%d]: modelFormat.name is required", i))
		} else {
			warnings = appendVersionWarnings(warnings, i, "modelFormat", *e.Format)
		}
		if e.Framework == nil || e.Framework.Name == "" {
			errs = append(errs, fmt.Sprintf("supportedModelFormats[%d]: modelFramework.name is required", i))
		} else {
			warnings = appendVersionWarnings(warnings, i, "modelFramework", *e.Framework)
		}
		if e.Priority < 1 {
			errs = append(errs, fmt.Sprintf("supportedModelFormats[%d]: priority must be at least 1", i))
		}
	}
	if len(rt.Entries) > 0 && !hasAutoSelectEntry(rt) {
		warnings = append(warnings, "no entry sets autoSelect: true, so OME uses the runtime only when an InferenceService names it")
	}
	if rt.Disabled {
		warnings = append(warnings, "disabled: true: OME never selects the runtime")
	}
	if r := rt.SizeRange; r != nil {
		for _, bound := range []struct {
			name  string
			value *string
		}{{"min", r.Min}, {"max", r.Max}} {
			if bound.value == nil {
				continue
			}
			if _, ok := parseSize(*bound.value); !ok {
				warnings = append(warnings, fmt.Sprintf("modelSizeRange.%s %q is not a parameter count such as 2B or 500M; OME reads it as 0", bound.name, *bound.value))
			}
		}
		if r.Min != nil && r.Max != nil {
			minSize, _ := parseSize(*r.Min)
			maxSize, _ := parseSize(*r.Max)
			if minSize > maxSize {
				warnings = append(warnings, fmt.Sprintf("modelSizeRange min %s is above max %s, so every model with a size is rejected", *r.Min, *r.Max))
			}
		}
	}
	for _, component := range []struct{ config, mode string }{{"engineConfig", rt.EngineMode}, {"decoderConfig", rt.DecoderMode}} {
		if component.mode != "" && !IsDeploymentMode(component.mode) {
			warnings = append(warnings, fmt.Sprintf("%s annotation %s %q is not a deployment mode; OME treats it as none", component.config, AnnotationDeploymentMode, component.mode))
		}
	}
	return errs, warnings
}

func appendVersionWarnings(warnings []string, index int, field string, v Versioned) []string {
	if v.Version != nil {
		if _, err := parseVersion(*v.Version); err != nil {
			warnings = append(warnings, fmt.Sprintf("supportedModelFormats[%d]: %s.version %q does not parse (%v), so the entry never matches", index, field, *v.Version, err))
		}
	}
	switch v.Operator {
	case "", OperatorEqual, OperatorGreaterThan, OperatorGreaterThanOrEqual:
	default:
		warnings = append(warnings, fmt.Sprintf("supportedModelFormats[%d]: %s.operator %q is not Equal, GreaterThan or GreaterThanOrEqual; OME compares as Equal", index, field, v.Operator))
	}
	return warnings
}
