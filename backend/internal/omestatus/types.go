package omestatus

import metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

// The types in this file mirror the OME API types the codec reads, with the
// same field order and JSON tags, so a status serializes byte for byte as it
// does under sigs.k8s.io/ome/pkg/apis/ome/v1beta1 (inferencereplica_types.go,
// lifecycle_types.go and inference_service_status.go at commit 8dea6804).
// Only the status side of the InferenceReplica is mirrored: the console
// decodes unstructured objects into these types and never imports the OME
// module, so a field added to the API is added here with the same tag.

// InferenceReplicaStatus is the observed state of one InferenceReplica.
//
// The per-Instance rows have exactly one representation on a committed
// object. Without instanceStatusEncoding the rows are the DenseV1 list in
// instanceStatuses; with instanceStatusEncoding: ColumnarV2 the same rows
// live in instanceStatusColumns and instanceStatuses is absent.
type InferenceReplicaStatus struct {
	// ObservedGeneration is the InferenceReplica.metadata.generation the
	// most recent status flush reflects.
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// ObservedTemplateHash is the pod-template hash updateRevision was last
	// computed from.
	ObservedTemplateHash string `json:"observedTemplateHash,omitempty"`

	// PlacementObservedGeneration is the generation reconciled with
	// placement rollout and replica-growth guards.
	PlacementObservedGeneration int64 `json:"placementObservedGeneration,omitempty"`

	// Replicas is the total Instance count (any phase).
	Replicas int32 `json:"replicas,omitempty"`

	// ReadyReplicas is the number of Instances whose every pod is Ready.
	ReadyReplicas int32 `json:"readyReplicas,omitempty"`

	// ServingReplicas is the number of Instances whose every pod is in the
	// load balancer rotation.
	ServingReplicas int32 `json:"servingReplicas,omitempty"`

	// AvailableReplicas is the number of Instances whose desired pod count
	// is Available.
	AvailableReplicas int32 `json:"availableReplicas,omitempty"`

	// UpdatedReplicas is the number of Instances on UpdateRevision.
	UpdatedReplicas int32 `json:"updatedReplicas,omitempty"`

	// UpdatedReadyReplicas is the number of Instances on UpdateRevision
	// that are fully Ready.
	UpdatedReadyReplicas int32 `json:"updatedReadyReplicas,omitempty"`

	// CurrentRevision names the ControllerRevision currently serving traffic.
	CurrentRevision string `json:"currentRevision,omitempty"`

	// UpdateRevision names the ControllerRevision being rolled out.
	UpdateRevision string `json:"updateRevision,omitempty"`

	// CollisionCount is the salt folded into the ControllerRevision hash
	// input after a name collision.
	CollisionCount *int32 `json:"collisionCount,omitempty"`

	// LabelSelector identifies the pods of this InferenceReplica.
	LabelSelector string `json:"labelSelector,omitempty"`

	// InstanceStatuses is the DenseV1 representation of the per-Instance
	// status, one row per Instance. Absent when instanceStatusEncoding is
	// ColumnarV2.
	InstanceStatuses []OMENativeInstanceStatus `json:"instanceStatuses,omitempty"`

	// InstanceStatusEncoding names the representation that carries the
	// per-Instance rows. Absent means DenseV1; the only accepted value is
	// ColumnarV2.
	InstanceStatusEncoding *InstanceStatusEncoding `json:"instanceStatusEncoding,omitempty"`

	// InstanceStatusColumns is the ColumnarV2 representation of the
	// per-Instance rows, present exactly when instanceStatusEncoding is
	// ColumnarV2.
	InstanceStatusColumns *InstanceStatusColumns `json:"instanceStatusColumns,omitempty"`

	// RetryBlocks records per-target-revision retry authority for update
	// attempts, one block per failed target revision.
	RetryBlocks []RetryBlock `json:"retryBlocks,omitempty"`

	// Migrations is the authoritative set of migration records, one entry
	// per request UUID.
	Migrations []MigrationStatus `json:"migrations,omitempty"`

	// Conditions reports InferenceReplica-level conditions.
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// Traffic reports per-revision traffic weights, one entry per revision
	// currently receiving traffic.
	Traffic []ComponentTrafficTarget `json:"traffic,omitempty"`

	// CoordinationGroupRef names the RolloutCoordinationGroup this replica
	// is bound into, if any.
	CoordinationGroupRef string `json:"coordinationGroupRef,omitempty"`

	// RolloutHold records the most recent reason a per-Instance Update was
	// denied; nil while the rollout is progressing or none is in flight.
	RolloutHold *RolloutHold `json:"rolloutHold,omitempty"`
}

// InstanceStatusEncoding names a stored representation of the per-Instance
// rows. The wire carries only ColumnarV2; an absent marker means DenseV1.
type InstanceStatusEncoding string

const (
	// InstanceStatusEncodingColumnarV2 stores the per-Instance rows in
	// instanceStatusColumns instead of the dense instanceStatuses list.
	InstanceStatusEncodingColumnarV2 InstanceStatusEncoding = "ColumnarV2"
)

// InstanceStatusColumns is the ColumnarV2 representation of the per-Instance
// rows. A value shared by many Instances is stored once against the index
// set of the Instances that carry it; records that are rare or unique per
// Instance stay keyed by index in entries.
//
// An index set is a string of comma-separated decimal terms, each a single
// index or a closed "first-last" range, for example "0-8,10-114,116". The
// canonical form is the only accepted one: terms are strictly ascending,
// disjoint, and nonadjacent, a range has first < last, indices are
// nonnegative int32 values without leading zeros, and there is no
// whitespace, sign, empty term, or trailing comma.
//
// Members is the complete row set; every other index set is a subset of it.
// Within one column the group index sets are pairwise disjoint and the groups
// are in canonical value order: bytewise for phases and revisions, signed
// numeric for incarnations and counts. A member absent from every group of
// an optional column takes that column's documented default.
type InstanceStatusColumns struct {
	// Members is the index set of every Instance that has a row.
	Members string `json:"members"`

	// RowOrder is the dense row order when it is not the ascending Members
	// order: every member exactly once. Absent means ascending order.
	RowOrder []int32 `json:"rowOrder,omitempty"`

	// Phases groups Instances by lifecycle phase. Every member appears in
	// exactly one group; there is no default phase.
	Phases []InstanceStatusPhaseGroup `json:"phases"`

	// RunningRevisions groups Instances by nonempty running revision.
	RunningRevisions []InstanceStatusRevisionGroup `json:"runningRevisions,omitempty"`

	// TargetRevisions groups Instances by nonempty target revision.
	TargetRevisions []InstanceStatusRevisionGroup `json:"targetRevisions,omitempty"`

	// Incarnations groups Instances by nonzero incarnation.
	Incarnations []InstanceStatusIncarnationGroup `json:"incarnations,omitempty"`

	// PodCounts groups Instances by positive podCount.
	PodCounts []InstanceStatusCountGroup `json:"podCounts,omitempty"`

	// ServingPodCounts groups Instances by positive servingPodCount.
	ServingPodCounts []InstanceStatusCountGroup `json:"servingPodCounts,omitempty"`

	// AvailablePodCounts groups Instances by positive availablePodCount.
	AvailablePodCounts []InstanceStatusCountGroup `json:"availablePodCounts,omitempty"`

	// Admitted is the index set of Instances whose admitted is true.
	Admitted *string `json:"admitted,omitempty"`

	// ActiveOrdinalOne is the index set of Instances whose activeOrdinal
	// is 1.
	ActiveOrdinalOne *string `json:"activeOrdinalOne,omitempty"`

	// Entries carries the per-Instance records that are not grouped, at
	// most one entry per member in ascending index order, each carrying at
	// least one record.
	Entries []InstanceStatusEntry `json:"entries,omitempty"`
}

// InstanceStatusPhaseGroup is one phase and the Instances that carry it.
type InstanceStatusPhaseGroup struct {
	// Value is the shared lifecycle phase.
	Value OMENativeInstancePhase `json:"value"`

	// Indexes is the canonical index set of the Instances with this value.
	Indexes string `json:"indexes"`
}

// InstanceStatusRevisionGroup is one full ControllerRevision name and the
// Instances that carry it.
type InstanceStatusRevisionGroup struct {
	// Value is the shared revision name; the empty revision is never grouped.
	Value string `json:"value"`

	// Indexes is the canonical index set of the Instances with this value.
	Indexes string `json:"indexes"`
}

// InstanceStatusIncarnationGroup is one incarnation and the Instances that
// carry it. Zero is the absent default and is never grouped.
type InstanceStatusIncarnationGroup struct {
	// Value is the shared nonzero incarnation.
	Value int64 `json:"value"`

	// Indexes is the canonical index set of the Instances with this value.
	Indexes string `json:"indexes"`
}

// InstanceStatusCountGroup is one positive pod count and the Instances that
// carry it. Zero is the absent default and is never grouped.
type InstanceStatusCountGroup struct {
	// Value is the shared positive count.
	Value int32 `json:"value"`

	// Indexes is the canonical index set of the Instances with this value.
	Indexes string `json:"indexes"`
}

// InstanceStatusEntry carries the records of one Instance that are not
// grouped into columns. Each record is the dense row's value, unchanged.
type InstanceStatusEntry struct {
	// Index is the Instance this entry belongs to; it is a member.
	Index int32 `json:"index"`

	// Conditions is the Instance's conditions.
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ReadySince is the Instance's readySince.
	ReadySince *metav1.Time `json:"readySince,omitempty"`

	// Operation is the Instance's in-flight operation record.
	Operation *InstanceOperation `json:"operation,omitempty"`

	// LastFailure is the Instance's preserved failure diagnostics.
	LastFailure *InstanceTermination `json:"lastFailure,omitempty"`

	// Announced is the Instance's record of once-only messages already
	// delivered.
	Announced []string `json:"announced,omitempty"`
}

// OMENativeInstancePhase is the lifecycle phase of an OMENative Instance.
type OMENativeInstancePhase string

const (
	OMENativeInstancePending    OMENativeInstancePhase = "Pending"
	OMENativeInstanceCreating   OMENativeInstancePhase = "Creating"
	OMENativeInstanceReady      OMENativeInstancePhase = "Ready"
	OMENativeInstanceUpdating   OMENativeInstancePhase = "Updating"
	OMENativeInstanceRestarting OMENativeInstancePhase = "Restarting"
	OMENativeInstanceMigrating  OMENativeInstancePhase = "Migrating"
	OMENativeInstanceFailed     OMENativeInstancePhase = "Failed"
	OMENativeInstanceDeleting   OMENativeInstancePhase = "Deleting"
)

// OMENativeInstanceStatus reports state for one OMENative Instance.
type OMENativeInstanceStatus struct {
	// Index is the stable Instance ordinal. Values may be sparse after
	// surge migration.
	Index int32 `json:"index"`

	// Incarnation increments each time the Instance is recreated.
	Incarnation int64 `json:"incarnation,omitempty"`

	// Phase is the lifecycle phase of the Instance.
	Phase OMENativeInstancePhase `json:"phase"`

	// RunningRevision is the ControllerRevision the live pods are running.
	RunningRevision string `json:"runningRevision,omitempty"`

	// TargetRevision is the ControllerRevision the live pods are converging
	// toward.
	TargetRevision string `json:"targetRevision,omitempty"`

	// PodCount is the total number of pods owned by this Instance.
	PodCount int32 `json:"podCount,omitempty"`

	// ReadyPodCount is retained for API compatibility; OMENative does not
	// persist it.
	ReadyPodCount int32 `json:"readyPodCount,omitempty"`

	// ServingPodCount is the number of pods in the load balancer rotation.
	ServingPodCount int32 `json:"servingPodCount,omitempty"`

	// AvailablePodCount is the number of pods that are Available.
	AvailablePodCount int32 `json:"availablePodCount,omitempty"`

	// ScheduledPodCount is retained for API compatibility; OMENative does
	// not persist it.
	ScheduledPodCount int32 `json:"scheduledPodCount,omitempty"`

	// Admitted is true once the Instance's pods have left the admission
	// scheduling gate.
	Admitted bool `json:"admitted,omitempty"`

	// NodesOccupied is retained for API compatibility; OMENative does not
	// persist it.
	NodesOccupied []string `json:"nodesOccupied,omitempty"`

	// Conditions reports Instance-level conditions.
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ReadySince is when the Instance last entered Ready.
	ReadySince *metav1.Time `json:"readySince,omitempty"`

	// Operation is the durable record of an in-flight destructive action
	// against this Instance.
	Operation *InstanceOperation `json:"operation,omitempty"`

	// ActiveOrdinal identifies which of two pod-naming slots (0 or 1)
	// currently holds the canonical pod for this single-pod Instance.
	ActiveOrdinal int32 `json:"activeOrdinal,omitempty"`

	// LastFailure preserves the diagnostics of the pod whose failure last
	// triggered a recreate of this Instance.
	LastFailure *InstanceTermination `json:"lastFailure,omitempty"`

	// Announced records the once-only messages this Instance has already
	// emitted.
	Announced []string `json:"announced,omitempty"`
}

// InstanceTermination captures the container-termination diagnostics of a
// pod that failed or was escalated.
type InstanceTermination struct {
	// PodName is the name of the pod that failed or was escalated.
	PodName string `json:"podName"`

	// ContainerName is the container the diagnostics were read from; empty
	// when the signal is pod-level.
	ContainerName string `json:"containerName,omitempty"`

	// Reason is the kubelet reason for the termination or wedge.
	Reason string `json:"reason,omitempty"`

	// ExitCode is the container's exit code when the diagnostics came from
	// a terminated state.
	ExitCode *int32 `json:"exitCode,omitempty"`

	// Message is the kubelet-supplied detail message, if any.
	Message string `json:"message,omitempty"`

	// Time is when OMENative recorded this termination.
	Time metav1.Time `json:"time,omitempty"`
}

// InstanceOperation is the recovery anchor written before any destructive
// action against an Instance and cleared on completion.
type InstanceOperation struct {
	// ID is the idempotency key for this operation.
	ID string `json:"id"`

	// Type identifies the operation kind.
	Type InstanceOperationType `json:"type"`

	// Step is the fine-grained resume point within the operation.
	Step string `json:"step"`

	// StartedAt is when this operation began.
	StartedAt metav1.Time `json:"startedAt"`

	// LastProgressAt is when the operation last advanced.
	LastProgressAt metav1.Time `json:"lastProgressAt"`

	// Deadline is the hard timeout for the current Step; null means the
	// step clock is parked.
	Deadline metav1.Time `json:"deadline"`

	// RetryCount is the per-step escalation counter.
	RetryCount int32 `json:"retryCount,omitempty"`

	// TargetRevision is the ControllerRevision the operation is converging
	// toward.
	TargetRevision string `json:"targetRevision,omitempty"`

	// Reason is a short cause string naming why the operation exists.
	Reason string `json:"reason,omitempty"`

	// Waiting is a short token naming an external condition currently
	// holding the operation back.
	Waiting string `json:"waiting,omitempty"`

	// CapacityRefusedAt is when admission last refused one of the
	// operation's pod creates for lack of quota.
	CapacityRefusedAt *metav1.Time `json:"capacityRefusedAt,omitempty"`

	// Strategy is the update strategy the operation runs under. Set only
	// when Type=Update.
	Strategy string `json:"strategy,omitempty"`

	// SurgeIndex is the Instance index allocated for a surge replacement.
	// Set only when Type=Migrate.
	SurgeIndex *int32 `json:"surgeIndex,omitempty"`

	// FromNode is the node the migrating Instance is being moved off. Set
	// only when Type=Migrate.
	FromNode string `json:"fromNode,omitempty"`

	// HintTargetNodes is the caller-supplied preferred-node list for a
	// migration. Set only when Type=Migrate.
	HintTargetNodes []string `json:"hintTargetNodes,omitempty"`

	// RequestUUID is the migration request UUID. Set only when
	// Type=Migrate.
	RequestUUID string `json:"requestUUID,omitempty"`
}

// InstanceOperationType is the kind of destructive action recorded in
// InstanceOperation.
type InstanceOperationType string

const (
	InstanceOperationCreate  InstanceOperationType = "Create"
	InstanceOperationUpdate  InstanceOperationType = "Update"
	InstanceOperationRestart InstanceOperationType = "Restart"
	InstanceOperationMigrate InstanceOperationType = "Migrate"
	InstanceOperationDelete  InstanceOperationType = "Delete"
)

// RetryBlockState is the retry authority state for one target revision.
type RetryBlockState string

const (
	// RetryBlockBackoff: attempts remain; the next one is authorized at
	// NextRetryAt.
	RetryBlockBackoff RetryBlockState = "Backoff"
	// RetryBlockHeld: attempts exhausted (or retry unconfigured). Only a
	// new target revision releases the hold.
	RetryBlockHeld RetryBlockState = "Held"
	// RetryBlockRetryInProgress: exactly one retry attempt is authorized
	// and running.
	RetryBlockRetryInProgress RetryBlockState = "RetryInProgress"
)

// RetryBlock is the persisted per-revision retry authority.
type RetryBlock struct {
	// TargetRevision is the ControllerRevision name this block scopes.
	TargetRevision string `json:"targetRevision"`

	State RetryBlockState `json:"state"`

	// AttemptsStarted counts lifecycle attempts at this revision.
	AttemptsStarted int32 `json:"attemptsStarted"`

	// NextRetryAt is the persisted resume time while State=Backoff.
	NextRetryAt *metav1.Time `json:"nextRetryAt,omitempty"`

	FirstFailureAt *metav1.Time `json:"firstFailureAt,omitempty"`
	LastFailureAt  *metav1.Time `json:"lastFailureAt,omitempty"`

	// Reason is the operator-facing last-failure summary.
	Reason string `json:"reason,omitempty"`
}

// MigrationTrigger identifies who initiated a migration entry.
type MigrationTrigger string

const (
	// MigrationTriggerManual marks an operator-requested migration.
	MigrationTriggerManual MigrationTrigger = "Manual"
	// MigrationTriggerAuto marks a controller-initiated relocation.
	MigrationTriggerAuto MigrationTrigger = "Auto"
)

// MigrationPhase is the lifecycle phase of a migration. Manual migrations
// walk Accepted -> SurgePending -> SurgeReady -> Draining -> Completed |
// Failed; Auto relocations are born terminal (Relocated). Pending and
// InProgress are legacy values of the ISVC status migrationHistory window.
type MigrationPhase string

const (
	MigrationPhaseAccepted     MigrationPhase = "Accepted"
	MigrationPhaseSurgePending MigrationPhase = "SurgePending"
	MigrationPhaseSurgeReady   MigrationPhase = "SurgeReady"
	MigrationPhaseDraining     MigrationPhase = "Draining"
	MigrationPhaseCompleted    MigrationPhase = "Completed"
	MigrationPhaseFailed       MigrationPhase = "Failed"
	MigrationPhaseRelocated    MigrationPhase = "Relocated"
	MigrationPhasePending      MigrationPhase = "Pending"
	MigrationPhaseInProgress   MigrationPhase = "InProgress"
)

// MigrationStatus is one migration request's authoritative record on the
// InferenceReplica.
type MigrationStatus struct {
	// RequestUUID uniquely identifies the migration request.
	RequestUUID string `json:"requestUUID"`

	// Trigger records who initiated the migration.
	Trigger MigrationTrigger `json:"trigger"`

	// SourceInstance is the Instance index being migrated away from.
	SourceInstance int32 `json:"sourceInstance"`

	// SurgeInstance is the Instance index allocated for the surge
	// replacement. Manual only; nil until allocated.
	SurgeInstance *int32 `json:"surgeInstance,omitempty"`

	// AllocatedAt is when the surge Instance index was allocated.
	AllocatedAt *metav1.Time `json:"allocatedAt,omitempty"`

	// FromNode is the node the source is being moved off.
	FromNode string `json:"fromNode,omitempty"`

	// HintTargetNodes are requester-supplied preferred placement targets
	// for the surge replacement.
	HintTargetNodes []string `json:"hintTargetNodes,omitempty"`

	// Phase is the migration lifecycle phase.
	Phase MigrationPhase `json:"phase"`

	// Attempt is the relocation attempt ordinal.
	Attempt int32 `json:"attempt,omitempty"`

	// Reason is the requester-supplied reason (Manual) or the disposition
	// branch that produced the entry (Auto).
	Reason string `json:"reason,omitempty"`

	// Message describes the current blocker or the terminal outcome.
	Message string `json:"message,omitempty"`

	// StartedAt is when the entry was created.
	StartedAt metav1.Time `json:"startedAt"`

	// Deadline is when a non-terminal entry expires.
	Deadline metav1.Time `json:"deadline"`

	// CompletedAt is when the entry reached a terminal phase.
	CompletedAt *metav1.Time `json:"completedAt,omitempty"`

	// Succeeded reports the post-hoc outcome.
	Succeeded *bool `json:"succeeded,omitempty"`
}

// RolloutHoldGate names the layer that most recently denied a per-Instance
// Update for a Component.
type RolloutHoldGate string

const (
	RolloutHoldGatePlan       RolloutHoldGate = "Plan"
	RolloutHoldGatePairing    RolloutHoldGate = "Pairing"
	RolloutHoldGateRatio      RolloutHoldGate = "Ratio"
	RolloutHoldGateSequential RolloutHoldGate = "Sequential"
	RolloutHoldGateBudget     RolloutHoldGate = "Budget"
	RolloutHoldGateRetryBlock RolloutHoldGate = "RetryBlock"
	RolloutHoldGateHeld       RolloutHoldGate = "Held"
)

// RolloutHold records the most recent reason a per-Instance Update was
// denied for a Component.
type RolloutHold struct {
	// Gate names the layer that produced Reason.
	Gate RolloutHoldGate `json:"gate"`

	// Reason is the operator-facing denial string from the gate.
	Reason string `json:"reason"`

	// Target is the ControllerRevision name the held Update was aimed at.
	Target string `json:"target,omitempty"`

	// Since is when this Gate+Target combination was first observed
	// without interruption.
	Since metav1.Time `json:"since"`
}

// ComponentTrafficTarget is one revision receiving traffic for a Component.
type ComponentTrafficTarget struct {
	// RevisionName is the per-revision Service name for this target.
	RevisionName string `json:"revisionName"`

	// Percent is the percentage of traffic routed to RevisionName.
	Percent int32 `json:"percent"`

	// Tag is an optional short identifier for the target.
	Tag string `json:"tag,omitempty"`

	// LatestRevision is true when this entry is the Component's latest
	// rolled-out revision.
	LatestRevision bool `json:"latestRevision,omitempty"`

	// PairingProtocol is the engine-decoder wire-compatibility token the
	// target's revision was minted under.
	PairingProtocol string `json:"pairingProtocol,omitempty"`
}
