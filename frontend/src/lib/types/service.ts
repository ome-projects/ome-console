// InferenceService types: aliases over the generated OME API types (see generated/ome.v1beta1.ts).

import type * as gen from './generated/ome.v1beta1'
import type { Resource } from './common'

export type { Condition, ResourceRequirements } from './common'

export type InferenceService = Resource<gen.InferenceService>
export type InferenceServiceSpec = gen.InferenceServiceSpec
export type InferenceServiceStatus = gen.InferenceServiceStatus
export type ModelRef = gen.ModelRef
export type ServingRuntimeRef = gen.ServingRuntimeRef
export type EngineSpec = gen.EngineSpec
export type DecoderSpec = gen.DecoderSpec
export type RouterSpec = gen.RouterSpec
export type ComponentExtensionSpec = gen.ComponentExtensionSpec
export type ComponentAutoscaler = gen.ComponentAutoscaler
export type LifecycleSpec = gen.LifecycleSpec
export type ComponentStatusSpec = gen.ComponentStatusSpec
export type DeploymentMode = gen.InferenceServiceSpecDeploymentMode

export { InferenceServiceSpecDeploymentModeValues as DeploymentModes } from './generated/ome.v1beta1'
