// InferenceReplica types: aliases over the generated OME API types (OMENative instances).

import type * as gen from './generated/ome.v1beta1'
import type { Resource } from './common'

export type InferenceReplica = Resource<gen.InferenceReplica>
export type InferenceReplicaSpec = gen.InferenceReplicaSpec
export type InferenceReplicaStatus = gen.InferenceReplicaStatus
export type OMENativeInstanceStatus = gen.OMENativeInstanceStatus
export type RetryBlock = gen.RetryBlock
export type MigrationStatus = gen.MigrationStatus
export type RolloutHold = gen.RolloutHold
export type InstancePhase = gen.OMENativeInstanceStatusPhase

export {
  OMENativeInstanceStatusPhaseValues as InstancePhases,
  RetryBlockStateValues as RetryBlockStates,
} from './generated/ome.v1beta1'

/** Label OME puts on every pod and InferenceReplica of an InferenceService. */
export const INFERENCE_SERVICE_LABEL = 'ome.io/inferenceservice'
