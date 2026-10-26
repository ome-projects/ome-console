package runtimeselect

import "testing"

// The "Accepted version formats" table of model-version-matching.md.
func TestParseVersion(t *testing.T) {
	cases := []struct {
		in         string
		parses     bool
		withSuffix bool
	}{
		{"1", true, false},
		{"v1.12", true, false},
		{"0.6.0", true, false},
		{"v0.8.0", true, false},
		{"4.51.3-SAM-HQ-preview", true, true},
		{"4.43.0+build", true, true},
		{"4.45.0.dev0", true, true},
		{"1.2.3.4", true, true},
		{"1.08.0", false, false},
		{"V1.0.0", false, false},
		{"1.2-beta", false, false},
		{"1.0.0-", false, false},
		{"", false, false},
		{"1.0.0+", false, false},
		{"v", false, false},
		{".1", false, false},
	}
	for _, tc := range cases {
		v, err := parseVersion(tc.in)
		if (err == nil) != tc.parses {
			t.Errorf("parseVersion(%q): err=%v, want parses=%v", tc.in, err, tc.parses)
			continue
		}
		if tc.parses && v.hasSuffix() != tc.withSuffix {
			t.Errorf("parseVersion(%q): hasSuffix=%v, want %v", tc.in, v.hasSuffix(), tc.withSuffix)
		}
	}
}

func TestParseVersionParts(t *testing.T) {
	v, err := parseVersion("v4.51.3-SAM-HQ-preview+build.1")
	if err != nil {
		t.Fatal(err)
	}
	if !v.prefixed || v.precision != 3 || v.major != 4 || v.minor != 51 || v.patch != 3 {
		t.Fatalf("unexpected numbers %+v", v)
	}
	equalStrings(t, "pre", v.pre, []string{"SAM-HQ-preview"})
	equalStrings(t, "build", v.build, []string{"build", "1"})
	if v, _ := parseVersion("1.12"); v.precision != 2 || v.minor != 12 || v.patch != 0 {
		t.Fatalf("unexpected 1.12 %+v", v)
	}
	if v, _ := parseVersion("4.45.0.dev0"); len(v.dev) != 1 || v.dev[0] != "dev0" {
		t.Fatalf("unexpected dev %+v", v)
	}
}

// The "Examples" table of model-version-matching.md, plus the GreaterThanOrEqual entry example.
func TestVersionAccepts(t *testing.T) {
	cases := []struct {
		entry, operator, model string
		want                   bool
	}{
		{"1.0.0", "Equal", "1.0.0", true},
		{"1.0.0", "", "1.0", true},
		{"1.8.0", "GreaterThan", "1.7.0", true},
		{"1.8.0", "GreaterThan", "1.8.0", false},
		{"1.8.0", "GreaterThanOrEqual", "1.8.0", true},
		{"4.50.0", "GreaterThanOrEqual", "4.36.2", true},
		{"4.50.0", "GreaterThanOrEqual", "4.51.0", false},
		{"1.8.0-dev", "GreaterThan", "1.8.0-dev", true},
		{"4.45.0.dev0", "GreaterThanOrEqual", "4.44.0", false},
		{"4.50.0", "GreaterThanOrEqual", "4.45.0.dev0", false},
		{"1.8", "GreaterThan", "1.7.0", false},
		// The entry with operator GreaterThanOrEqual from the "Operators" section.
		{"4.46.0", "GreaterThanOrEqual", "4.44.2", true},
		{"4.46.0", "GreaterThanOrEqual", "4.45.0.dev0", false},
		{"4.46.0", "GreaterThanOrEqual", "v4.44.2", false},
		{"4.46.0", "GreaterThanOrEqual", "4.44", false},
		// Equal ignores the "v" and the precision.
		{"v1.0.0", "Equal", "1.0", true},
		// Any other operator compares as Equal, with the same precision and prefix.
		{"1.0.0", "LessThan", "1.0.0", true},
		{"1.0.0", "LessThan", "1.0", false},
		{"1.0.0", "equal", "v1.0.0", false},
		{"1.8.0-dev", "LessThan", "1.8.0-dev", true},
		// A version that does not parse never matches.
		{"1.08.0", "Equal", "1.8.0", false},
		{"1.8.0", "GreaterThan", "1.7-beta", false},
	}
	for _, tc := range cases {
		if got := versionAccepts(tc.entry, tc.model, tc.operator); got != tc.want {
			t.Errorf("entry %q %s model %q: got %v, want %v", tc.entry, tc.operator, tc.model, got, tc.want)
		}
	}
}
