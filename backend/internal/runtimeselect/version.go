package runtimeselect

import (
	"cmp"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// version is a parsed version: one to three dot-separated numbers, an optional leading "v", and,
// after the third number, optional pre-release ("-"), build ("+") and dev (".") suffixes.
type version struct {
	major, minor, patch uint64
	// prefixed is true for a version written with a leading "v".
	prefixed bool
	// precision is the number of numeric parts given: 1, 2 or 3.
	precision       int
	pre, build, dev []string
}

// parseVersion parses a version as OME does. It accepts "1", "v1.12", "0.6.0", "v0.8.0",
// "4.51.3-SAM-HQ-preview", "4.43.0+build", "4.45.0.dev0" and "1.2.3.4", and rejects a leading
// zero ("1.08.0"), a capital "V", a suffix before the third number ("1.2-beta"), an empty suffix
// ("1.0.0-") and the empty string.
func parseVersion(s string) (version, error) {
	if s == "" {
		return version{}, errors.New("version is empty")
	}
	parts := strings.SplitN(s, ".", 3)
	v := version{precision: len(parts)}

	majorStr := parts[0]
	if strings.HasPrefix(majorStr, "v") {
		v.prefixed = true
		majorStr = majorStr[1:]
	}
	var err error
	if v.major, err = parseNumber(majorStr, "major"); err != nil {
		return version{}, err
	}
	if len(parts) > 1 {
		if v.minor, err = parseNumber(parts[1], "minor"); err != nil {
			return version{}, err
		}
	}
	patchStr := "0"
	if len(parts) > 2 {
		patchStr = parts[2]
	}
	// The suffixes come off in OME's order: the build after "+", then the pre-release after
	// "-", then the dev part after ".". Each splits on "." and must have no empty part.
	patchStr, buildStr, hasBuild := cutSuffix(patchStr, '+')
	patchStr, preStr, hasPre := cutSuffix(patchStr, '-')
	patchStr, devStr, hasDev := cutSuffix(patchStr, '.')
	if v.patch, err = parseNumber(patchStr, "patch"); err != nil {
		return version{}, err
	}
	for _, suffix := range []struct {
		present bool
		raw     string
		what    string
		dst     *[]string
	}{
		{hasPre, preStr, "pre-release", &v.pre},
		{hasBuild, buildStr, "build", &v.build},
		{hasDev, devStr, "dev", &v.dev},
	} {
		if !suffix.present {
			continue
		}
		if *suffix.dst, err = suffixParts(suffix.raw, suffix.what); err != nil {
			return version{}, err
		}
	}
	return v, nil
}

// cutSuffix splits s at the first sep into the part before it and the suffix after it.
func cutSuffix(s string, sep byte) (head, tail string, found bool) {
	i := strings.IndexByte(s, sep)
	if i < 0 {
		return s, "", false
	}
	return s[:i], s[i+1:], true
}

// suffixParts splits a suffix on "." and rejects an empty part.
func suffixParts(s, what string) ([]string, error) {
	parts := strings.Split(s, ".")
	for _, p := range parts {
		if p == "" {
			return nil, fmt.Errorf("%s suffix has an empty part", what)
		}
	}
	return parts, nil
}

// parseNumber parses one numeric part: digits only, no leading zero.
func parseNumber(s, what string) (uint64, error) {
	if s == "" {
		return 0, fmt.Errorf("%s number is empty", what)
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid character in %s number %q", what, s)
		}
	}
	if len(s) > 1 && s[0] == '0' {
		return 0, fmt.Errorf("%s number %q has a leading zero", what, s)
	}
	return strconv.ParseUint(s, 10, 64)
}

// hasSuffix reports whether the version carries a pre-release, build or dev suffix.
func (v version) hasSuffix() bool {
	return len(v.pre) > 0 || len(v.build) > 0 || len(v.dev) > 0
}

// compare orders two versions by their numbers, then by their pre-release, build and dev parts
// (element by element, then by count). The precision and the "v" prefix do not count, so "1.0"
// equals "v1.0.0".
func (v version) compare(o version) int {
	if c := cmp.Compare(v.major, o.major); c != 0 {
		return c
	}
	if c := cmp.Compare(v.minor, o.minor); c != 0 {
		return c
	}
	if c := cmp.Compare(v.patch, o.patch); c != 0 {
		return c
	}
	if c := compareParts(v.pre, o.pre); c != 0 {
		return c
	}
	if c := compareParts(v.build, o.build); c != 0 {
		return c
	}
	return compareParts(v.dev, o.dev)
}

func compareParts(a, b []string) int {
	for i := 0; i < min(len(a), len(b)); i++ {
		if c := strings.Compare(a[i], b[i]); c != 0 {
			return c
		}
	}
	return cmp.Compare(len(a), len(b))
}

// versionAccepts reports whether a runtime entry's version accepts the model's under the entry's
// operator. A version that does not parse never matches. With Equal, or when either version has
// a suffix, only an equal version matches. The ordering operators also need both versions to
// have the same number of parts and the same "v" prefix; the entry's version is the upper bound.
func versionAccepts(entryVersion, modelVersion, operator string) bool {
	entry, err := parseVersion(entryVersion)
	if err != nil {
		return false
	}
	model, err := parseVersion(modelVersion)
	if err != nil {
		return false
	}
	if operator == "" {
		operator = OperatorEqual
	}
	if operator == OperatorEqual || entry.hasSuffix() || model.hasSuffix() {
		return entry.compare(model) == 0
	}
	if entry.precision != model.precision || entry.prefixed != model.prefixed {
		return false
	}
	switch operator {
	case OperatorGreaterThan:
		return entry.compare(model) > 0
	case OperatorGreaterThanOrEqual:
		return entry.compare(model) >= 0
	default:
		return entry.compare(model) == 0
	}
}
