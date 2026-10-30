package runtimeselect

import "testing"

// The "Units and format" table of model-size-range-matching.md.
func TestParseSize(t *testing.T) {
	cases := []struct {
		in   string
		want float64
		ok   bool
	}{
		{"500M", 500e6, true},
		{"3.21B", 3.21e9, true},
		{"1.5T", 1.5e12, true},
		{"999", 999, true},
		{"4b", 0, false},
		{"", 0, false},
		{"B", 0, false},
		{"2 B", 0, false},
	}
	for _, tc := range cases {
		got, ok := parseSize(tc.in)
		if got != tc.want || ok != tc.ok {
			t.Errorf("parseSize(%q) = %v, %v; want %v, %v", tc.in, got, ok, tc.want, tc.ok)
		}
	}
	half, _ := parseSize("0.5B")
	if m, _ := parseSize("500M"); half != m {
		t.Errorf("0.5B (%v) should equal 500M (%v)", half, m)
	}
}

// The "Examples" table of model-size-range-matching.md, plus the warning about values OME
// cannot parse and the rule that min above max rejects every model with a size.
func TestSizeRangeContains(t *testing.T) {
	cases := []struct {
		min, max, size string
		want           bool
	}{
		{"2B", "4B", "3.21B", true},
		{"2B", "4B", "4B", true},
		{"500M", "2B", "3.21B", false},
		{"1B", "4B", "1500M", true},
		{"70B", "", "405B", true},
		{"", "13B", "3.21B", true},
		{"2B", "4B", "", true},
		// A max of 4b reads as 0 and rejects every model with a size.
		{"2B", "4b", "3.21B", false},
		// A min of 2b reads as 0 and sets no lower limit.
		{"2b", "4B", "1M", true},
		{"4B", "2B", "3B", false},
	}
	for _, tc := range cases {
		rt := withRange(clusterRuntime("rt"), tc.min, tc.max)
		got := true
		if tc.size != "" {
			size, _ := parseSize(tc.size)
			got = rt.SizeRange.contains(size)
		}
		if got != tc.want {
			t.Errorf("[%s, %s] contains %q: got %v, want %v", tc.min, tc.max, tc.size, got, tc.want)
		}
	}
	var none *SizeRange
	if !none.contains(1e12) {
		t.Error("a runtime without a range must pass every size")
	}
}

func TestSizeRangeLabel(t *testing.T) {
	cases := []struct{ min, max, want string }{
		{"500M", "2B", "[500M, 2B]"},
		{"70B", "", "[70B, inf)"},
		{"", "13B", "(-inf, 13B]"},
		{"2B", "4b", "[2B, 4b]"},
	}
	for _, tc := range cases {
		if got := withRange(clusterRuntime("rt"), tc.min, tc.max).SizeRange.label(); got != tc.want {
			t.Errorf("label [%s, %s] = %q, want %q", tc.min, tc.max, got, tc.want)
		}
	}
}

// The distances of the worked example in runtime-selection-scoring.md, for a 3.21B model.
func TestSizeRangeDistance(t *testing.T) {
	size, _ := parseSize("3.21B")
	cases := []struct {
		min, max string
		want     float64
	}{
		{"", "", 0},
		{"1B", "8B", 7e9},
		{"1B", "70B", 69e9},
		{"1B", "", 2.21e9},
		{"", "8B", 4.79e9},
	}
	for _, tc := range cases {
		rt := clusterRuntime("rt")
		if tc.min != "" || tc.max != "" {
			rt = withRange(rt, tc.min, tc.max)
		}
		got := rt.SizeRange.distance(size)
		if diff := got - tc.want; diff > 1 || diff < -1 {
			t.Errorf("distance [%s, %s] = %v, want %v", tc.min, tc.max, got, tc.want)
		}
	}
}
