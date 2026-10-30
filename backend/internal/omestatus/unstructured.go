package omestatus

import (
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
)

// DefaultMaxInstances is the ColumnarV2 row bound OME's own CLI passes when
// it decodes InferenceReplica statuses (pkg/cli/instancecollection and
// pkg/cli/waitscale at commit 8dea6804). A bound of zero fails closed on
// every ColumnarV2 payload.
const DefaultMaxInstances uint64 = 20000

// Decoded is one InferenceReplica status in the dense logical shape: the
// per-Instance rows in stored row order, the representation they were read
// from, and every status field outside the per-Instance representation.
type Decoded struct {
	// Encoding is the representation the rows were stored in.
	Encoding Encoding

	// Instances is the dense row list; nil when the status has no rows.
	Instances []OMENativeInstanceStatus

	// Status carries the counters, revisions, conditions, retry blocks,
	// migrations, traffic and rollout hold. Its three per-Instance
	// representation fields are cleared: the rows live only in Instances.
	Status InferenceReplicaStatus
}

// DecodeUnstructured decodes the status map of an unstructured
// InferenceReplica, as the dynamic client and the informers deliver it
// (Object["status"]), into the dense logical shape. A ColumnarV2 payload is
// validated and expanded under maxInstances; DenseV1 rows are taken as stored
// and receive no new cardinality check, so a bound of zero decodes DenseV1
// and fails closed on every ColumnarV2 payload, as the OME codec does. A nil
// map is an empty DenseV1 status; fields the mirror does not know are
// ignored. On error nothing is returned: a conversion failure is reported as
// such and a codec failure carries its ErrorReason.
func DecodeUnstructured(status map[string]any, maxInstances uint64) (*Decoded, error) {
	var typed InferenceReplicaStatus
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(status, &typed); err != nil {
		return nil, fmt.Errorf("convert inferencereplica status: %w", err)
	}
	rows, encoding, err := DecodeStatus(&typed, maxInstances)
	if err != nil {
		return nil, err
	}
	typed.InstanceStatuses = nil
	typed.InstanceStatusEncoding = nil
	typed.InstanceStatusColumns = nil
	return &Decoded{Encoding: encoding, Instances: rows, Status: typed}, nil
}
