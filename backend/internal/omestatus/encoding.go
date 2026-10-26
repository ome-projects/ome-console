// Package omestatus is the codec for the per-Instance representation union of
// InferenceReplica status: the dense instanceStatuses list (DenseV1) and the
// grouped instanceStatusColumns payload (ColumnarV2). Both decode to the same
// logical rows in the same order; every failure carries a fixed-catalog
// reason and never returns a partial row set.
//
// The package is a port of OME's pkg/controller/v1beta1/irstatus
// (github.com/ome-projects/ome, module sigs.k8s.io/ome) at commit 8dea6804,
// with the v1beta1 API types replaced by the mirrors in types.go so the
// console does not depend on the OME module. The algorithms, error catalog,
// tests and fixtures are the source's, file for file; a change to the codec
// is made in OME and re-ported here, never made locally. DecodeUnstructured
// in unstructured.go is the console's own entry point.
package omestatus

// Encoding identifies the representation that carries the per-Instance rows
// of an InferenceReplica status.
type Encoding string

const (
	// EncodingDenseV1 is the dense instanceStatuses list, marked by an absent
	// instanceStatusEncoding.
	EncodingDenseV1 Encoding = "DenseV1"
	// EncodingColumnarV2 is the instanceStatusColumns payload under the
	// ColumnarV2 marker.
	EncodingColumnarV2 Encoding = "ColumnarV2"
)

// ObservedEncoding reports which representation status carries. It fails
// closed on an unknown marker and on every mixed spelling of the union: an
// unmarked status with columns, or a ColumnarV2 status without columns or
// with dense rows. A nil status is an empty DenseV1 status.
func ObservedEncoding(status *InferenceReplicaStatus) (Encoding, error) {
	if status == nil {
		return EncodingDenseV1, nil
	}
	if status.InstanceStatusEncoding == nil {
		if status.InstanceStatusColumns != nil {
			return "", newCodecError(ErrorReasonRepresentationUnion)
		}
		return EncodingDenseV1, nil
	}
	switch *status.InstanceStatusEncoding {
	case InstanceStatusEncodingColumnarV2:
		if status.InstanceStatusColumns == nil || len(status.InstanceStatuses) != 0 {
			return "", newCodecError(ErrorReasonRepresentationUnion)
		}
		return EncodingColumnarV2, nil
	default:
		return "", newCodecError(ErrorReasonUnknownEncoding)
	}
}

// DecodeStatus returns the logical rows of status in dense order together
// with the representation they were read from. DenseV1 rows are the stored
// slice itself and receive no new cardinality check; ColumnarV2 rows are
// validated and expanded under maxInstances into a fresh slice. On error no
// rows are returned.
func DecodeStatus(status *InferenceReplicaStatus, maxInstances uint64) ([]OMENativeInstanceStatus, Encoding, error) {
	encoding, err := ObservedEncoding(status)
	if err != nil {
		return nil, "", err
	}
	if encoding == EncodingDenseV1 {
		if status == nil {
			return nil, EncodingDenseV1, nil
		}
		return status.InstanceStatuses, EncodingDenseV1, nil
	}
	rows, err := DecodeColumns(status.InstanceStatusColumns, maxInstances)
	if err != nil {
		return nil, "", err
	}
	return rows, EncodingColumnarV2, nil
}

// ClearPodDerivedObservations zeroes the three row fields that DenseV1 does
// not persist because workload decisions derive them from current Pods.
// Neither representation stores them, so a write copy clears them before
// either candidate is built.
func ClearPodDerivedObservations(rows []OMENativeInstanceStatus) {
	for i := range rows {
		rows[i].ReadyPodCount = 0
		rows[i].ScheduledPodCount = 0
		rows[i].NodesOccupied = nil
	}
}

// supportedPhase reports whether phase is one of the Instance phases the
// column schema enumerates.
func supportedPhase(phase OMENativeInstancePhase) bool {
	switch phase {
	case OMENativeInstancePending, OMENativeInstanceCreating, OMENativeInstanceReady,
		OMENativeInstanceUpdating, OMENativeInstanceRestarting, OMENativeInstanceMigrating,
		OMENativeInstanceFailed, OMENativeInstanceDeleting:
		return true
	default:
		return false
	}
}

// entryHasContent reports whether an entry carries at least one exceptional
// record. Reused nested records keep their DenseV1 normalization, so an
// explicitly empty conditions list counts as absent.
func entryHasContent(entry *InstanceStatusEntry) bool {
	return len(entry.Conditions) > 0 || entry.ReadySince != nil || entry.Operation != nil || entry.LastFailure != nil ||
		len(entry.Announced) > 0
}
