// ServingRuntime and ClusterServingRuntime types: aliases over the generated OME API types.

import type * as gen from './generated/ome.v1beta1'
import type { Container, Resource } from './common'

export type {
  ResourceRequirements,
  EnvVar,
  VolumeMount,
  Volume,
  Container,
  Toleration,
  LocalObjectReference,
} from './common'

export type ClusterServingRuntime = Resource<gen.ClusterServingRuntime>
export type ServingRuntime = Resource<gen.ServingRuntime>
/** A runtime of either scope; `metadata.namespace` is set only on a ServingRuntime. */
export type Runtime = ClusterServingRuntime | ServingRuntime

export type ServingRuntimeSpec = gen.ServingRuntimeSpec
export type ServingRuntimeStatus = gen.ServingRuntimeStatus
export type SupportedModelFormat = gen.SupportedModelFormat
export type ModelFormat = gen.ModelFormat
export type ModelFramework = gen.ModelFrameworkSpec
export type ModelSizeRange = gen.ModelSizeRangeSpec
export type ScalingPolicy = gen.ScalingPolicy
export type AcceleratorRequirements = gen.AcceleratorRequirements
export type AcceleratorSelector = gen.AcceleratorSelector

/** Runtime component configs are the same types as the InferenceService components. */
export type EngineConfig = gen.EngineSpec
export type DecoderConfig = gen.DecoderSpec
export type RouterConfig = gen.RouterSpec
export type RunnerSpec = gen.RunnerSpec
export type LeaderSpec = gen.LeaderSpec
export type WorkerSpec = gen.WorkerSpec

/** Containers in a runtime pod spec are plain Kubernetes containers. */
export type ContainerSpec = Container

// Console-side DTOs returned by the backend's runtime matching endpoints.

export interface RuntimeMatch {
  runtime: ClusterServingRuntime
  score: number
  compatibleWith: string[]
  reasons: string[]
  warnings?: string[]
  recommendation: string
}

export interface CompatibilityCheck {
  compatible: boolean
  reasons: string[]
  warnings?: string[]
  score: number
}

export interface RuntimeValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
