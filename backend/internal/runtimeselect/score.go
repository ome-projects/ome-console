package runtimeselect

import "fmt"

// What a weight of 0 counts as. Writing weight: 0 raises the score rather than switching the
// weight off; the API's default is 1.
const (
	zeroFormatWeight    = 10
	zeroFrameworkWeight = 5
)

// entryScore is (format weight + framework weight) × priority when the entry's format and
// framework match the model's, names and versions included, and 0 otherwise. The framework
// weight counts only when the entry has a framework.
func entryScore(model Model, e Entry) int {
	if !formatMatches(model, e) || !frameworkMatches(model, e) {
		return 0
	}
	format, framework := entryWeights(e)
	return (format + framework) * e.Priority
}

// entryWeights are the entry's effective weights: a weight of 0 counts as zeroFormatWeight or
// zeroFrameworkWeight, and an entry without a framework has a framework weight of 0.
func entryWeights(e Entry) (format, framework int) {
	if e.Format != nil {
		format = e.Format.Weight
		if format == 0 {
			format = zeroFormatWeight
		}
	}
	if e.Framework != nil {
		framework = e.Framework.Weight
		if framework == 0 {
			framework = zeroFrameworkWeight
		}
	}
	return format, framework
}

// bestScore is the runtime's auto-selection score: the highest entryScore of the entries that do
// not set autoSelect: false, with the index of the entry that gave it. A score of 0 or less
// reports index -1.
func bestScore(model Model, rt Runtime) (score, index int) {
	index = -1
	for i, e := range rt.Entries {
		if e.AutoSelect != nil && !*e.AutoSelect {
			continue
		}
		if s := entryScore(model, e); s > score {
			score, index = s, i
		}
	}
	return score, index
}

// hasAutoSelectEntry reports whether any entry sets autoSelect: true, which auto-selection
// requires of the runtime, whichever entry matches the model.
func hasAutoSelectEntry(rt Runtime) bool {
	for _, e := range rt.Entries {
		if e.AutoSelect != nil && *e.AutoSelect {
			return true
		}
	}
	return false
}

// scoreReason spells out how the entry at index scored.
func scoreReason(score, index int, e Entry) string {
	format, framework := entryWeights(e)
	if e.Framework == nil {
		return fmt.Sprintf("score %d = %d * %d from supportedModelFormats[%d]", score, format, e.Priority, index)
	}
	return fmt.Sprintf("score %d = (%d + %d) * %d from supportedModelFormats[%d]", score, format, framework, e.Priority, index)
}
