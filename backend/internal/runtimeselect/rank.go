package runtimeselect

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
)

// Evaluate checks one runtime against the request with the rules in the order OME applies them:
// disabled, accelerator classes, deployment modes, supported model formats, model size, then
// auto-selection. It reads the runtime's own spec, as auto-selection does; pass a runtime from
// Resolve to check it the way OME checks a runtime an InferenceService names.
func Evaluate(rt Runtime, req Request) Candidate {
	c := Candidate{Runtime: rt.Ref, Reasons: []string{}}
	exclude := func(reason string) Candidate {
		c.Exclusion = reason
		return c
	}
	if rt.Disabled {
		return exclude("runtime is disabled")
	}
	if !acceleratorsOK(rt, req.AcceleratorClasses) {
		return exclude("runtime does not support the required accelerator class")
	}
	if reason := modeMismatch(rt, req); reason != "" {
		return exclude(reason)
	}

	model := req.Model
	matched := -1
	var mismatches []string
	for i, e := range rt.Entries {
		ok, reason := matchEntry(model, e)
		if ok {
			matched = i
			break
		}
		mismatches = append(mismatches, reason)
	}
	if matched < 0 {
		detail := "no supported formats defined"
		if len(mismatches) > 0 {
			detail = strings.Join(mismatches, "; ")
		}
		return exclude(fmt.Sprintf("model format '%s' not in supported formats: %s", modelLabel(model), detail))
	}

	var size float64
	hasSize := model.ParameterSize != nil
	if hasSize {
		size, _ = parseSize(*model.ParameterSize)
	}
	if hasSize && rt.SizeRange != nil && !rt.SizeRange.contains(size) {
		return exclude(fmt.Sprintf("model size %s is outside supported range %s", *model.ParameterSize, rt.SizeRange.label()))
	}

	c.Compatible = true
	c.Reasons = append(c.Reasons, fmt.Sprintf("supportedModelFormats[%d] matches: %s", matched, describeEntry(rt.Entries[matched])))
	if hasSize && rt.SizeRange != nil {
		c.Reasons = append(c.Reasons, fmt.Sprintf("model size %s is within %s", *model.ParameterSize, rt.SizeRange.label()))
	}
	if len(req.AcceleratorClasses) > 0 {
		c.Reasons = append(c.Reasons, "lists the requested accelerator classes: "+strings.Join(req.AcceleratorClasses, ", "))
	}
	if IsDeploymentMode(rt.EngineMode) && IsDeploymentMode(req.EngineMode) {
		c.Reasons = append(c.Reasons, "engine deployment mode "+rt.EngineMode+" matches the request")
	}
	if IsDeploymentMode(rt.DecoderMode) && IsDeploymentMode(req.DecoderMode) {
		c.Reasons = append(c.Reasons, "decoder deployment mode "+rt.DecoderMode+" matches the request")
	}
	if rt.InheritFrom != "" {
		c.Reasons = append(c.Reasons, fmt.Sprintf("inherits from %s; the merged spec applies only when an InferenceService names this runtime", rt.InheritFrom))
	}

	if !hasAutoSelectEntry(rt) {
		c.Reasons = append(c.Reasons, "supports the model but has no supportedModelFormats[].autoSelect=true entry, so automatic selection skips it (pin it explicitly via spec.runtime.name instead)")
		return c
	}
	score, best := bestScore(model, rt)
	if score <= 0 {
		if e := rt.Entries[matched]; e.AutoSelect == nil || !*e.AutoSelect {
			c.Reasons = append(c.Reasons, fmt.Sprintf("matching format %s is not autoSelect-enabled (a different supportedModelFormats entry on this runtime has autoSelect=true, but not the one that matches this model)", e.Format.Name))
		} else {
			c.Reasons = append(c.Reasons, "auto-select score is 0")
		}
		return c
	}
	c.AutoSelect = true
	c.Score = score
	c.Reasons = append(c.Reasons, scoreReason(score, best, rt.Entries[best]))
	return c
}

// Explain evaluates every runtime against the request and ranks the results. The runtimes OME
// could auto-select come first, in the order OME picks from: ServingRuntimes before
// ClusterServingRuntimes, then the higher score, then the modelSizeRange closer to the model's
// size (a runtime without one is closest), then the name. The compatible runtimes OME would not
// pick on its own follow, then the excluded ones, each group with ServingRuntimes first and then
// by name.
func Explain(runtimes []Runtime, req Request) []Candidate {
	type ranked struct {
		Candidate
		distance float64
	}
	var size float64
	hasSize := req.Model.ParameterSize != nil
	if hasSize {
		size, _ = parseSize(*req.Model.ParameterSize)
	}
	items := make([]ranked, 0, len(runtimes))
	for _, rt := range runtimes {
		item := ranked{Candidate: Evaluate(rt, req)}
		if hasSize {
			item.distance = rt.SizeRange.distance(size)
		}
		items = append(items, item)
	}
	slices.SortStableFunc(items, func(a, b ranked) int {
		if c := cmp.Compare(tier(a.Candidate), tier(b.Candidate)); c != 0 {
			return c
		}
		if a.Runtime.Kind != b.Runtime.Kind {
			if a.Runtime.Kind == KindServingRuntime {
				return -1
			}
			return 1
		}
		if a.AutoSelect {
			if c := cmp.Compare(b.Score, a.Score); c != 0 {
				return c
			}
			if c := cmp.Compare(a.distance, b.distance); c != 0 {
				return c
			}
		}
		if c := strings.Compare(a.Runtime.Name, b.Runtime.Name); c != 0 {
			return c
		}
		return strings.Compare(a.Runtime.Namespace, b.Runtime.Namespace)
	})
	out := make([]Candidate, len(items))
	for i := range items {
		out[i] = items[i].Candidate
	}
	return out
}

// tier groups candidates for ranking: auto-selectable, then compatible, then excluded.
func tier(c Candidate) int {
	switch {
	case c.AutoSelect:
		return 0
	case c.Compatible:
		return 1
	}
	return 2
}
