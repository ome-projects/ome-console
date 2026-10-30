package omestatus

import metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

// The copy methods in this file mirror the deepcopy-gen output for the types
// in types.go (sigs.k8s.io/ome/pkg/apis/ome/v1beta1/zz_generated.deepcopy.go
// at commit 8dea6804), kept to the types the codec and its tests copy. As in
// the generated code, a nil receiver copies to nil.

// DeepCopyInto copies the receiver into out.
func (in *InferenceReplicaStatus) DeepCopyInto(out *InferenceReplicaStatus) {
	*out = *in
	if in.CollisionCount != nil {
		in, out := &in.CollisionCount, &out.CollisionCount
		*out = new(int32)
		**out = **in
	}
	if in.InstanceStatuses != nil {
		in, out := &in.InstanceStatuses, &out.InstanceStatuses
		*out = make([]OMENativeInstanceStatus, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.InstanceStatusEncoding != nil {
		in, out := &in.InstanceStatusEncoding, &out.InstanceStatusEncoding
		*out = new(InstanceStatusEncoding)
		**out = **in
	}
	if in.InstanceStatusColumns != nil {
		in, out := &in.InstanceStatusColumns, &out.InstanceStatusColumns
		*out = new(InstanceStatusColumns)
		(*in).DeepCopyInto(*out)
	}
	if in.RetryBlocks != nil {
		in, out := &in.RetryBlocks, &out.RetryBlocks
		*out = make([]RetryBlock, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.Migrations != nil {
		in, out := &in.Migrations, &out.Migrations
		*out = make([]MigrationStatus, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.Conditions != nil {
		in, out := &in.Conditions, &out.Conditions
		*out = make([]metav1.Condition, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.Traffic != nil {
		in, out := &in.Traffic, &out.Traffic
		*out = make([]ComponentTrafficTarget, len(*in))
		copy(*out, *in)
	}
	if in.RolloutHold != nil {
		in, out := &in.RolloutHold, &out.RolloutHold
		*out = new(RolloutHold)
		(*in).DeepCopyInto(*out)
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *InferenceReplicaStatus) DeepCopy() *InferenceReplicaStatus {
	if in == nil {
		return nil
	}
	out := new(InferenceReplicaStatus)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *InstanceStatusColumns) DeepCopyInto(out *InstanceStatusColumns) {
	*out = *in
	if in.RowOrder != nil {
		in, out := &in.RowOrder, &out.RowOrder
		*out = make([]int32, len(*in))
		copy(*out, *in)
	}
	if in.Phases != nil {
		in, out := &in.Phases, &out.Phases
		*out = make([]InstanceStatusPhaseGroup, len(*in))
		copy(*out, *in)
	}
	if in.RunningRevisions != nil {
		in, out := &in.RunningRevisions, &out.RunningRevisions
		*out = make([]InstanceStatusRevisionGroup, len(*in))
		copy(*out, *in)
	}
	if in.TargetRevisions != nil {
		in, out := &in.TargetRevisions, &out.TargetRevisions
		*out = make([]InstanceStatusRevisionGroup, len(*in))
		copy(*out, *in)
	}
	if in.Incarnations != nil {
		in, out := &in.Incarnations, &out.Incarnations
		*out = make([]InstanceStatusIncarnationGroup, len(*in))
		copy(*out, *in)
	}
	if in.PodCounts != nil {
		in, out := &in.PodCounts, &out.PodCounts
		*out = make([]InstanceStatusCountGroup, len(*in))
		copy(*out, *in)
	}
	if in.ServingPodCounts != nil {
		in, out := &in.ServingPodCounts, &out.ServingPodCounts
		*out = make([]InstanceStatusCountGroup, len(*in))
		copy(*out, *in)
	}
	if in.AvailablePodCounts != nil {
		in, out := &in.AvailablePodCounts, &out.AvailablePodCounts
		*out = make([]InstanceStatusCountGroup, len(*in))
		copy(*out, *in)
	}
	if in.Admitted != nil {
		in, out := &in.Admitted, &out.Admitted
		*out = new(string)
		**out = **in
	}
	if in.ActiveOrdinalOne != nil {
		in, out := &in.ActiveOrdinalOne, &out.ActiveOrdinalOne
		*out = new(string)
		**out = **in
	}
	if in.Entries != nil {
		in, out := &in.Entries, &out.Entries
		*out = make([]InstanceStatusEntry, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *InstanceStatusColumns) DeepCopy() *InstanceStatusColumns {
	if in == nil {
		return nil
	}
	out := new(InstanceStatusColumns)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *InstanceStatusEntry) DeepCopyInto(out *InstanceStatusEntry) {
	*out = *in
	if in.Conditions != nil {
		in, out := &in.Conditions, &out.Conditions
		*out = make([]metav1.Condition, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.ReadySince != nil {
		in, out := &in.ReadySince, &out.ReadySince
		*out = (*in).DeepCopy()
	}
	if in.Operation != nil {
		in, out := &in.Operation, &out.Operation
		*out = new(InstanceOperation)
		(*in).DeepCopyInto(*out)
	}
	if in.LastFailure != nil {
		in, out := &in.LastFailure, &out.LastFailure
		*out = new(InstanceTermination)
		(*in).DeepCopyInto(*out)
	}
	if in.Announced != nil {
		in, out := &in.Announced, &out.Announced
		*out = make([]string, len(*in))
		copy(*out, *in)
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *InstanceStatusEntry) DeepCopy() *InstanceStatusEntry {
	if in == nil {
		return nil
	}
	out := new(InstanceStatusEntry)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *OMENativeInstanceStatus) DeepCopyInto(out *OMENativeInstanceStatus) {
	*out = *in
	if in.NodesOccupied != nil {
		in, out := &in.NodesOccupied, &out.NodesOccupied
		*out = make([]string, len(*in))
		copy(*out, *in)
	}
	if in.Conditions != nil {
		in, out := &in.Conditions, &out.Conditions
		*out = make([]metav1.Condition, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
	if in.ReadySince != nil {
		in, out := &in.ReadySince, &out.ReadySince
		*out = (*in).DeepCopy()
	}
	if in.Operation != nil {
		in, out := &in.Operation, &out.Operation
		*out = new(InstanceOperation)
		(*in).DeepCopyInto(*out)
	}
	if in.LastFailure != nil {
		in, out := &in.LastFailure, &out.LastFailure
		*out = new(InstanceTermination)
		(*in).DeepCopyInto(*out)
	}
	if in.Announced != nil {
		in, out := &in.Announced, &out.Announced
		*out = make([]string, len(*in))
		copy(*out, *in)
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *OMENativeInstanceStatus) DeepCopy() *OMENativeInstanceStatus {
	if in == nil {
		return nil
	}
	out := new(OMENativeInstanceStatus)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *InstanceOperation) DeepCopyInto(out *InstanceOperation) {
	*out = *in
	in.StartedAt.DeepCopyInto(&out.StartedAt)
	in.LastProgressAt.DeepCopyInto(&out.LastProgressAt)
	in.Deadline.DeepCopyInto(&out.Deadline)
	if in.CapacityRefusedAt != nil {
		in, out := &in.CapacityRefusedAt, &out.CapacityRefusedAt
		*out = (*in).DeepCopy()
	}
	if in.SurgeIndex != nil {
		in, out := &in.SurgeIndex, &out.SurgeIndex
		*out = new(int32)
		**out = **in
	}
	if in.HintTargetNodes != nil {
		in, out := &in.HintTargetNodes, &out.HintTargetNodes
		*out = make([]string, len(*in))
		copy(*out, *in)
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *InstanceOperation) DeepCopy() *InstanceOperation {
	if in == nil {
		return nil
	}
	out := new(InstanceOperation)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *InstanceTermination) DeepCopyInto(out *InstanceTermination) {
	*out = *in
	if in.ExitCode != nil {
		in, out := &in.ExitCode, &out.ExitCode
		*out = new(int32)
		**out = **in
	}
	in.Time.DeepCopyInto(&out.Time)
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *InstanceTermination) DeepCopy() *InstanceTermination {
	if in == nil {
		return nil
	}
	out := new(InstanceTermination)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *RetryBlock) DeepCopyInto(out *RetryBlock) {
	*out = *in
	if in.NextRetryAt != nil {
		in, out := &in.NextRetryAt, &out.NextRetryAt
		*out = (*in).DeepCopy()
	}
	if in.FirstFailureAt != nil {
		in, out := &in.FirstFailureAt, &out.FirstFailureAt
		*out = (*in).DeepCopy()
	}
	if in.LastFailureAt != nil {
		in, out := &in.LastFailureAt, &out.LastFailureAt
		*out = (*in).DeepCopy()
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *RetryBlock) DeepCopy() *RetryBlock {
	if in == nil {
		return nil
	}
	out := new(RetryBlock)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *MigrationStatus) DeepCopyInto(out *MigrationStatus) {
	*out = *in
	if in.SurgeInstance != nil {
		in, out := &in.SurgeInstance, &out.SurgeInstance
		*out = new(int32)
		**out = **in
	}
	if in.AllocatedAt != nil {
		in, out := &in.AllocatedAt, &out.AllocatedAt
		*out = (*in).DeepCopy()
	}
	if in.HintTargetNodes != nil {
		in, out := &in.HintTargetNodes, &out.HintTargetNodes
		*out = make([]string, len(*in))
		copy(*out, *in)
	}
	in.StartedAt.DeepCopyInto(&out.StartedAt)
	in.Deadline.DeepCopyInto(&out.Deadline)
	if in.CompletedAt != nil {
		in, out := &in.CompletedAt, &out.CompletedAt
		*out = (*in).DeepCopy()
	}
	if in.Succeeded != nil {
		in, out := &in.Succeeded, &out.Succeeded
		*out = new(bool)
		**out = **in
	}
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *MigrationStatus) DeepCopy() *MigrationStatus {
	if in == nil {
		return nil
	}
	out := new(MigrationStatus)
	in.DeepCopyInto(out)
	return out
}

// DeepCopyInto copies the receiver into out.
func (in *RolloutHold) DeepCopyInto(out *RolloutHold) {
	*out = *in
	in.Since.DeepCopyInto(&out.Since)
}

// DeepCopy returns a deep copy of the receiver; nil copies to nil.
func (in *RolloutHold) DeepCopy() *RolloutHold {
	if in == nil {
		return nil
	}
	out := new(RolloutHold)
	in.DeepCopyInto(out)
	return out
}
