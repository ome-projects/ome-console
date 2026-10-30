package omestatus

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// The row fixtures live in fixtures_test.go, OME's irstatustest package, so
// the same deterministic inputs are measured here as in OME; these names keep
// the codec tests terse.
const (
	fixtureRevision      = Revision
	fixtureOtherRevision = OtherRevision
	fixtureContainer     = Container
)

var fixtureTime = Time

func fixtureTimePlus(d time.Duration) metav1.Time { return TimePlus(d) }

func uniformRows(n int) []OMENativeInstanceStatus { return UniformRows(n) }
func massFailureRows() []OMENativeInstanceStatus  { return MassFailureRows() }
func representativeRows(n int) []OMENativeInstanceStatus {
	return RepresentativeRows(n)
}
func fullFeatureRows() []OMENativeInstanceStatus { return FullFeatureRows() }
func wireExampleRows() []OMENativeInstanceStatus { return WireExampleRows() }

func logicalStatus(rows []OMENativeInstanceStatus) *InferenceReplicaStatus {
	return LogicalStatus(rows)
}

func columnarStatus(columns *InstanceStatusColumns) *InferenceReplicaStatus {
	encoding := InstanceStatusEncodingColumnarV2
	return &InferenceReplicaStatus{InstanceStatusEncoding: &encoding, InstanceStatusColumns: columns}
}

func mustEncode(t testing.TB, rows []OMENativeInstanceStatus, limit uint64) *InstanceStatusColumns {
	t.Helper()
	columns, err := EncodeColumns(rows, limit)
	if err != nil {
		t.Fatalf("EncodeColumns() error = %v", err)
	}
	return columns
}

func mustDecode(t testing.TB, columns *InstanceStatusColumns, limit uint64) []OMENativeInstanceStatus {
	t.Helper()
	rows, err := DecodeColumns(columns, limit)
	if err != nil {
		t.Fatalf("DecodeColumns() error = %v", err)
	}
	return rows
}

func mustJSON(t testing.TB, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}

// assertRowsEqual compares rows with API semantics: nil and empty slices are
// the same, times compare by instant, and pointers compare by value.
func assertRowsEqual(t testing.TB, want, got []OMENativeInstanceStatus) {
	t.Helper()
	if len(want) != len(got) {
		t.Fatalf("row count = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if !equality.Semantic.DeepEqual(want[i], got[i]) {
			t.Fatalf("row %d differs:\n want %s\n got  %s", i, mustJSON(t, want[i]), mustJSON(t, got[i]))
		}
		if wantJSON, gotJSON := mustJSON(t, want[i]), mustJSON(t, got[i]); string(wantJSON) != string(gotJSON) {
			t.Fatalf("row %d wire differs:\n want %s\n got  %s", i, wantJSON, gotJSON)
		}
	}
}

func assertColumnsEqual(t testing.TB, want, got *InstanceStatusColumns) {
	t.Helper()
	if wantJSON, gotJSON := mustJSON(t, want), mustJSON(t, got); string(wantJSON) != string(gotJSON) {
		t.Fatalf("columns differ:\n want %s\n got  %s", wantJSON, gotJSON)
	}
}
