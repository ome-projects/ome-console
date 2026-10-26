package runtimeselect

import (
	"math"
	"strconv"
	"strings"
)

// parseSize reads a parameter count the way OME does: a number, which may have a decimal point,
// followed by an optional uppercase M, B or T suffix, as in "500M", "3.21B", "1.5T" and "999". A
// value that does not parse, such as "4b", reads as 0, and ok reports the difference.
func parseSize(s string) (size float64, ok bool) {
	multiplier := 1.0
	switch {
	case strings.HasSuffix(s, "T"):
		multiplier = 1e12
		s = strings.TrimSuffix(s, "T")
	case strings.HasSuffix(s, "B"):
		multiplier = 1e9
		s = strings.TrimSuffix(s, "B")
	case strings.HasSuffix(s, "M"):
		multiplier = 1e6
		s = strings.TrimSuffix(s, "M")
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return n * multiplier, true
}

// contains reports whether size is within the range. The bounds are inclusive, an unset bound is
// open and a bound that does not parse counts as 0.
func (r *SizeRange) contains(size float64) bool {
	if r == nil {
		return true
	}
	if r.Min != nil {
		if minSize, _ := parseSize(*r.Min); size < minSize {
			return false
		}
	}
	if r.Max != nil {
		if maxSize, _ := parseSize(*r.Max); size > maxSize {
			return false
		}
	}
	return true
}

// distance is how far the range is from size: the sum of the distances to each set bound, so the
// width of a range with both bounds when size is within it. A nil range has distance 0.
func (r *SizeRange) distance(size float64) float64 {
	if r == nil {
		return 0
	}
	var d float64
	if r.Min != nil {
		minSize, _ := parseSize(*r.Min)
		d += math.Abs(minSize - size)
	}
	if r.Max != nil {
		maxSize, _ := parseSize(*r.Max)
		d += math.Abs(maxSize - size)
	}
	return d
}

// label renders the range as OME's reasons do: "[2B, 4B]", "[70B, inf)" or "(-inf, 13B]".
func (r *SizeRange) label() string {
	lower, upper := "(-inf", "inf)"
	if r.Min != nil {
		lower = "[" + *r.Min
	}
	if r.Max != nil {
		upper = *r.Max + "]"
	}
	return lower + ", " + upper
}
