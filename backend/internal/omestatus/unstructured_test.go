package omestatus

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// decoratedStatus is the logical status of rows with every field outside the
// per-Instance representation populated, so a decode shows them surviving.
func decoratedStatus(rows []OMENativeInstanceStatus) *InferenceReplicaStatus {
	collision := int32(1)
	surge := int32(9)
	succeeded := true
	nextRetry := fixtureTimePlus(10 * time.Minute)
	status := logicalStatus(rows)
	status.ObservedGeneration = 7
	status.ObservedTemplateHash = "5d8f9c0b1a"
	status.PlacementObservedGeneration = 7
	status.ReadyReplicas = int32(len(rows)) - 1
	status.ServingReplicas = int32(len(rows)) - 1
	status.AvailableReplicas = int32(len(rows)) - 2
	status.UpdatedReplicas = 3
	status.UpdatedReadyReplicas = 2
	status.UpdateRevision = fixtureOtherRevision
	status.CollisionCount = &collision
	status.RetryBlocks = []RetryBlock{{
		TargetRevision: fixtureOtherRevision, State: RetryBlockBackoff, AttemptsStarted: 2,
		NextRetryAt: &nextRetry, FirstFailureAt: &fixtureTime, LastFailureAt: &nextRetry, Reason: "CrashLoopBackOff",
	}}
	status.Migrations = []MigrationStatus{
		{
			RequestUUID: "9c0d1e2f-0000-4000-8000-000000000001", Trigger: MigrationTriggerManual, SourceInstance: 4,
			SurgeInstance: &surge, AllocatedAt: &fixtureTime, FromNode: "node-a", HintTargetNodes: []string{"node-c"},
			Phase: MigrationPhaseSurgePending, Reason: "maintenance", Message: "waiting for the surge Instance",
			StartedAt: fixtureTime, Deadline: fixtureTimePlus(time.Hour),
		},
		{
			RequestUUID: "9c0d1e2f-0000-4000-8000-000000000002", Trigger: MigrationTriggerAuto, SourceInstance: 2,
			FromNode: "node-b", Phase: MigrationPhaseRelocated, Attempt: 1, StartedAt: fixtureTime, Deadline: fixtureTime,
			CompletedAt: &fixtureTime, Succeeded: &succeeded,
		},
	}
	status.Conditions = []metav1.Condition{{
		Type: "Ready", Status: metav1.ConditionFalse, ObservedGeneration: 7, LastTransitionTime: fixtureTime,
		Reason: "RolloutInProgress", Message: "2 of 8 Instances updated",
	}}
	status.Traffic = []ComponentTrafficTarget{
		{RevisionName: fixtureRevision, Percent: 90, Tag: "stable"},
		{RevisionName: fixtureOtherRevision, Percent: 10, Tag: "canary", LatestRevision: true, PairingProtocol: "v2"},
	}
	status.CoordinationGroupRef = "llama-70b-rollout"
	status.RolloutHold = &RolloutHold{Gate: RolloutHoldGateBudget, Reason: "maxUnavailable budget exhausted", Target: fixtureOtherRevision, Since: fixtureTime}
	return status
}

// columnarVariant is status with its rows moved into the ColumnarV2
// representation and every other field unchanged.
func columnarVariant(t *testing.T, status *InferenceReplicaStatus) *InferenceReplicaStatus {
	t.Helper()
	columnar := status.DeepCopy()
	columnar.InstanceStatusColumns = mustEncode(t, status.InstanceStatuses, testLimit)
	columnar.InstanceStatuses = nil
	encoding := InstanceStatusEncodingColumnarV2
	columnar.InstanceStatusEncoding = &encoding
	return columnar
}

// asUnstructured shapes status the way the API machinery shapes a
// dynamic-client object: nested maps and slices with int64 numbers.
func asUnstructured(t *testing.T, status *InferenceReplicaStatus) map[string]any {
	t.Helper()
	content, err := runtime.DefaultUnstructuredConverter.ToUnstructured(status)
	if err != nil {
		t.Fatalf("ToUnstructured: %v", err)
	}
	return content
}

// asJSONMap shapes status through encoding/json, where every number is a
// float64.
func asJSONMap(t *testing.T, status *InferenceReplicaStatus) map[string]any {
	t.Helper()
	var content map[string]any
	if err := json.Unmarshal(mustJSON(t, status), &content); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return content
}

func TestDecodeUnstructuredDenseAndColumnarAgree(t *testing.T) {
	t.Parallel()
	converters := map[string]func(*testing.T, *InferenceReplicaStatus) map[string]any{
		"converter": asUnstructured,
		"json":      asJSONMap,
	}
	// The full-feature rows carry int64 and int32 boundary values a float64
	// cannot hold, so they go through the converter only.
	fixtures := map[string]struct {
		rows    []OMENativeInstanceStatus
		viaJSON bool
	}{
		"full feature":   {rows: fullFeatureRows()},
		"wire example":   {rows: wireExampleRows(), viaJSON: true},
		"representative": {rows: representativeRows(300), viaJSON: true},
	}
	for converterName, convert := range converters {
		for fixtureName, fixture := range fixtures {
			if converterName == "json" && !fixture.viaJSON {
				continue
			}
			dense := decoratedStatus(fixture.rows)
			want := dense.DeepCopy()
			want.InstanceStatuses = nil
			for _, test := range []struct {
				name         string
				status       *InferenceReplicaStatus
				wantEncoding Encoding
			}{
				{name: "dense", status: dense, wantEncoding: EncodingDenseV1},
				{name: "columnar", status: columnarVariant(t, dense), wantEncoding: EncodingColumnarV2},
			} {
				t.Run(converterName+"/"+fixtureName+"/"+test.name, func(t *testing.T) {
					t.Parallel()
					decoded, err := DecodeUnstructured(convert(t, test.status), DefaultMaxInstances)
					if err != nil {
						t.Fatalf("DecodeUnstructured() error = %v", err)
					}
					if decoded.Encoding != test.wantEncoding {
						t.Fatalf("encoding = %q, want %q", decoded.Encoding, test.wantEncoding)
					}
					assertRowsEqual(t, fixture.rows, decoded.Instances)
					if decoded.Status.InstanceStatuses != nil || decoded.Status.InstanceStatusEncoding != nil || decoded.Status.InstanceStatusColumns != nil {
						t.Fatal("decoded status still carries a per-Instance representation")
					}
					if !equality.Semantic.DeepEqual(*want, decoded.Status) {
						t.Fatalf("status outside the rows differs:\n want %s\n got  %s", mustJSON(t, want), mustJSON(t, decoded.Status))
					}
				})
			}
		}
	}
}

// The documented wire example, as the dynamic client delivers a status, must
// decode to the wire example rows with its other fields intact.
func TestDecodeUnstructuredWireExample(t *testing.T) {
	t.Parallel()
	const raw = `{"observedGeneration":4,"replicas":500,"readyReplicas":500,"servingReplicas":500,"availableReplicas":500,` +
		`"updatedReplicas":500,"updatedReadyReplicas":500,"currentRevision":"example-engine-2f32f6fe","updateRevision":"example-engine-2f32f6fe",` +
		`"labelSelector":"ome.io/inferenceservice=llama-70b,ome.io/component=engine","instanceStatusEncoding":"ColumnarV2",` +
		`"instanceStatusColumns":{"members":"0-499","phases":[{"value":"Ready","indexes":"0-499"}],` +
		`"runningRevisions":[{"value":"example-engine-2f32f6fe","indexes":"0-499"}],` +
		`"incarnations":[{"value":1,"indexes":"0-8,10-114,116-499"},{"value":2,"indexes":"9,115"}],` +
		`"podCounts":[{"value":1,"indexes":"0-499"}],"servingPodCounts":[{"value":1,"indexes":"0-499"}],` +
		`"availablePodCounts":[{"value":1,"indexes":"0-499"}],"admitted":"0-499","activeOrdinalOne":"6,43,175",` +
		`"entries":[{"index":9,"lastFailure":{"podName":"example-engine-9","containerName":"ome-container","reason":"Error","exitCode":143,"time":"2026-03-04T05:06:07Z"}}]},` +
		`"conditions":[{"type":"Ready","status":"True","observedGeneration":4,"lastTransitionTime":"2026-03-04T05:06:07Z","reason":"AllInstancesReady","message":"500 of 500 Instances ready"}]}`
	var content map[string]any
	if err := json.Unmarshal([]byte(raw), &content); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	decoded, err := DecodeUnstructured(content, DefaultMaxInstances)
	if err != nil {
		t.Fatalf("DecodeUnstructured() error = %v", err)
	}
	if decoded.Encoding != EncodingColumnarV2 || len(decoded.Instances) != 500 {
		t.Fatalf("decoded (%d rows, %q), want (500 rows, %q)", len(decoded.Instances), decoded.Encoding, EncodingColumnarV2)
	}
	assertRowsEqual(t, wireExampleRows(), decoded.Instances)
	status := decoded.Status
	if status.ObservedGeneration != 4 || status.Replicas != 500 || status.ReadyReplicas != 500 || status.ServingReplicas != 500 ||
		status.AvailableReplicas != 500 || status.UpdatedReplicas != 500 || status.UpdatedReadyReplicas != 500 ||
		status.CurrentRevision != fixtureRevision || status.UpdateRevision != fixtureRevision ||
		status.LabelSelector != "ome.io/inferenceservice=llama-70b,ome.io/component=engine" {
		t.Fatalf("counters and revisions were not carried: %s", mustJSON(t, status))
	}
	if len(status.Conditions) != 1 || status.Conditions[0].Type != "Ready" || status.Conditions[0].Status != metav1.ConditionTrue ||
		status.Conditions[0].ObservedGeneration != 4 || !status.Conditions[0].LastTransitionTime.Equal(&fixtureTime) ||
		status.Conditions[0].Reason != "AllInstancesReady" {
		t.Fatalf("conditions were not carried: %s", mustJSON(t, status.Conditions))
	}
	if status.InstanceStatuses != nil || status.InstanceStatusEncoding != nil || status.InstanceStatusColumns != nil {
		t.Fatal("decoded status still carries a per-Instance representation")
	}
}

func TestDecodeUnstructuredBound(t *testing.T) {
	t.Parallel()
	rows := uniformRows(10)
	dense := asUnstructured(t, logicalStatus(rows))
	columnar := asUnstructured(t, columnarStatus(mustEncode(t, rows, testLimit)))

	// DenseV1 rows are taken as stored and receive no cardinality check.
	decoded, err := DecodeUnstructured(dense, 0)
	if err != nil || decoded.Encoding != EncodingDenseV1 || len(decoded.Instances) != 10 {
		t.Fatalf("DecodeUnstructured(dense, 0) = %+v, %v", decoded, err)
	}
	// A bound of zero fails closed on ColumnarV2, as does one below the row count.
	for _, limit := range []uint64{0, 9} {
		decoded, err := DecodeUnstructured(columnar, limit)
		if decoded != nil {
			t.Fatalf("limit %d: failed decode returned %+v", limit, decoded)
		}
		assertCodecReason(t, err, ErrorReasonCardinalityLimit)
	}
	decoded, err = DecodeUnstructured(columnar, 10)
	if err != nil || decoded.Encoding != EncodingColumnarV2 || len(decoded.Instances) != 10 {
		t.Fatalf("DecodeUnstructured(columnar, 10) = %+v, %v", decoded, err)
	}
	assertRowsEqual(t, rows, decoded.Instances)
}

func TestDecodeUnstructuredFailsClosed(t *testing.T) {
	t.Parallel()
	columns := asUnstructured(t, columnarStatus(mustEncode(t, uniformRows(3), testLimit)))["instanceStatusColumns"]
	tests := []struct {
		name       string
		status     map[string]any
		wantReason ErrorReason
	}{
		{name: "unmarked with columns", status: map[string]any{"instanceStatusColumns": columns}, wantReason: ErrorReasonRepresentationUnion},
		{name: "marker without columns", status: map[string]any{"instanceStatusEncoding": "ColumnarV2"}, wantReason: ErrorReasonRepresentationUnion},
		{name: "marker with dense rows", status: map[string]any{
			"instanceStatusEncoding": "ColumnarV2", "instanceStatusColumns": columns,
			"instanceStatuses": []any{map[string]any{"index": int64(0), "phase": "Ready"}},
		}, wantReason: ErrorReasonRepresentationUnion},
		{name: "unknown marker", status: map[string]any{"instanceStatusEncoding": "ColumnarV3", "instanceStatusColumns": columns}, wantReason: ErrorReasonUnknownEncoding},
		{name: "corrupt columns", status: map[string]any{
			"instanceStatusEncoding": "ColumnarV2", "instanceStatusColumns": map[string]any{"members": "0-2"},
		}, wantReason: ErrorReasonCoverage},
		{name: "noncanonical members", status: map[string]any{
			"instanceStatusEncoding": "ColumnarV2",
			"instanceStatusColumns":  map[string]any{"members": "0-1,2", "phases": []any{map[string]any{"value": "Ready", "indexes": "0-2"}}},
		}, wantReason: ErrorReasonCanonicalOrder},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			decoded, err := DecodeUnstructured(test.status, DefaultMaxInstances)
			if decoded != nil {
				t.Fatalf("failed decode returned %+v", decoded)
			}
			assertCodecReason(t, err, test.wantReason)
		})
	}
}

func TestDecodeUnstructuredConversion(t *testing.T) {
	t.Parallel()
	// A nil or empty map is an empty DenseV1 status.
	for name, status := range map[string]map[string]any{"nil": nil, "empty": {}} {
		decoded, err := DecodeUnstructured(status, DefaultMaxInstances)
		if err != nil || decoded.Encoding != EncodingDenseV1 || decoded.Instances != nil || !equality.Semantic.DeepEqual(decoded.Status, InferenceReplicaStatus{}) {
			t.Fatalf("%s map: DecodeUnstructured() = %+v, %v", name, decoded, err)
		}
	}
	// Numbers arrive as int64 or float64; fields the mirror does not know
	// are ignored.
	decoded, err := DecodeUnstructured(map[string]any{"replicas": int64(3), "readyReplicas": float64(2), "futureField": true}, DefaultMaxInstances)
	if err != nil || decoded.Status.Replicas != 3 || decoded.Status.ReadyReplicas != 2 {
		t.Fatalf("DecodeUnstructured() = %+v, %v", decoded, err)
	}
	// A value of the wrong type is a conversion error, not a codec error.
	decoded, err = DecodeUnstructured(map[string]any{"replicas": "three"}, DefaultMaxInstances)
	if decoded != nil || err == nil {
		t.Fatalf("mistyped field decoded: %+v, %v", decoded, err)
	}
	if reason, ok := ErrorReasonOf(err); ok {
		t.Fatalf("conversion failure reported as codec reason %q", reason)
	}
}
