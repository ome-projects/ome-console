import { z } from 'zod'
import {
  ProportionalPolicyAnchorValues,
  ScalingPolicyModeValues,
} from '../types/generated/ome.v1beta1'
import type { Runtime } from '../types/runtime'
import { RUNTIME_PROFILE_ANNOTATION } from '../constants/runtime-annotations'
import { componentExtensionFormSchema, k8sNameSchema, kedaTriggersProblem } from './service-schema'

export const RUNTIME_KINDS = ['ClusterServingRuntime', 'ServingRuntime'] as const
export type RuntimeKind = (typeof RUNTIME_KINDS)[number]

// ---------------------------------------------------------------------------------------------
// Model size range. OME reads `modelSizeRange.min` and `.max` as `<number>[M|B|T]` parameters
// (million, billion, trillion) and treats anything else, such as a lowercase `4b`, as 0.
// ---------------------------------------------------------------------------------------------

export const MODEL_SIZE_PATTERN = /^\d+(\.\d+)?[MBT]?$/
export const MODEL_SIZE_MESSAGE =
  'Use a number with an optional uppercase M, B or T suffix, e.g. 7B or 350M'

const SIZE_MULTIPLIERS: Record<string, number> = { M: 1e6, B: 1e9, T: 1e12 }

/** The parameter count a size stands for, as OME's runtime selector reads it: 0 when it does not parse. */
export function parseModelSize(size: string): number {
  if (!MODEL_SIZE_PATTERN.test(size)) return 0
  const multiplier = SIZE_MULTIPLIERS[size.slice(-1)] ?? 1
  return parseFloat(size) * multiplier
}

const modelSizeSchema = z
  .string()
  .optional()
  .refine((value) => !value || MODEL_SIZE_PATTERN.test(value), MODEL_SIZE_MESSAGE)

/** Kubernetes resource.Quantity, which the CRD requires for `scalingPolicy.proportional.ratios` values. */
export const QUANTITY_PATTERN =
  /^(\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))(([KMGTPE]i)|[numkMGTPE]|([eE](\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))))?$/

const required = (message: string) => z.string({ error: message }).min(1, message)

const optionalInt = (min: number, message: string) =>
  z.number().int('Must be a whole number').min(min, message).optional()

// ---------------------------------------------------------------------------------------------
// The form values: the runtime object itself (kind, metadata, spec) plus the fields the form
// derives from annotations. Every object is `z.looseObject`, so a stored env `valueFrom`, a
// probe, a toleration or any field the form has no inputs for survives validation untouched
// and is written back as it was read. The component configs carry the ComponentExtensionFields
// form shape for the autoscaler block; `buildRuntime` turns it into the API shape.
// ---------------------------------------------------------------------------------------------

const quantity = z.union([z.string(), z.number()])

export const envVarSchema = z.looseObject({
  name: required('Environment variable name is required'),
  value: z.string().optional(),
})

export const resourceRequirementsSchema = z.looseObject({
  requests: z.record(z.string(), quantity).optional(),
  limits: z.record(z.string(), quantity).optional(),
})

export const volumeMountSchema = z.looseObject({
  name: required('Volume mount name is required'),
  mountPath: required('Mount path is required'),
  readOnly: z.boolean().optional(),
})

export const containerSchema = z.looseObject({
  name: required('Container name is required'),
  image: required('Container image is required'),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  env: z.array(envVarSchema).optional(),
  resources: resourceRequirementsSchema.optional(),
  volumeMounts: z.array(volumeMountSchema).optional(),
})

export const runnerSpecSchema = z.looseObject({
  name: z.string().optional(),
  image: z.string().optional(),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  env: z.array(envVarSchema).optional(),
  resources: resourceRequirementsSchema.optional(),
  volumeMounts: z.array(volumeMountSchema).optional(),
})

export const leaderSpecSchema = z.looseObject({ runner: runnerSpecSchema.optional() })

export const workerSpecSchema = z.looseObject({
  size: optionalInt(1, 'Worker size must be 1 or more'),
  runner: runnerSpecSchema.optional(),
})

export const volumeSchema = z.looseObject({ name: required('Volume name is required') })

const componentConfigFormObject = z.looseObject({
  ...componentExtensionFormSchema.shape,
  runner: runnerSpecSchema.optional(),
  leader: leaderSpecSchema.optional(),
  worker: workerSpecSchema.optional(),
  volumes: z.array(volumeSchema).optional(),
  initContainers: z.array(containerSchema).optional(),
  sidecars: z.array(containerSchema).optional(),
  config: z
    .record(z.string(), z.string(), { error: 'Must be a JSON object of string values' })
    .optional(),
})

export type ComponentConfigFormValues = z.infer<typeof componentConfigFormObject>

/** The rules OME's runtime webhook applies to a component's autoscaler block. */
function checkComponentConfig(values: ComponentConfigFormValues, ctx: z.RefinementCtx): void {
  if (
    values.minReplicas !== undefined &&
    values.maxReplicas !== undefined &&
    values.minReplicas > values.maxReplicas
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['minReplicas'],
      message: 'Min replicas must not exceed max replicas',
    })
  }
  if (values.autoscaler.class === 'KEDA') {
    const triggers = values.autoscaler.keda.triggersYaml
    const problem =
      kedaTriggersProblem(triggers) ??
      (triggers.trim() ? null : 'KEDA autoscaling needs at least one trigger')
    if (problem) {
      ctx.addIssue({
        code: 'custom',
        path: ['autoscaler', 'keda', 'triggersYaml'],
        message: problem,
      })
    }
  }
}

export const componentConfigFormSchema = componentConfigFormObject.superRefine(checkComponentConfig)

export const supportedModelFormatSchema = z.looseObject({
  /** Pre-v1.3 entries named the format here; the selector reads `modelFormat.name`. */
  name: z.string().optional(),
  modelFormat: z.looseObject({
    name: required('Format name is required'),
    version: z.string().optional(),
  }),
  modelFramework: z.looseObject({
    name: required('Framework name is required'),
    version: z.string().optional(),
  }),
  modelArchitecture: z.string().optional(),
  quantization: z.string().optional(),
  autoSelect: z.boolean().optional(),
  priority: optionalInt(1, 'Priority must be 1 or more'),
})

export type SupportedModelFormatFormValues = z.infer<typeof supportedModelFormatSchema>

export const scalingPolicyFormSchema = z.looseObject({
  /** '' leaves `spec.scalingPolicy` unset. */
  mode: z.enum(ScalingPolicyModeValues).or(z.literal('')),
  proportional: z.looseObject({
    anchor: z.enum(ProportionalPolicyAnchorValues),
    /** Follower component to its ratio; '' for unset. */
    ratios: z.record(
      z.string(),
      z
        .string()
        .refine(
          (value) => !value || QUANTITY_PATTERN.test(value),
          'Ratios are decimal quantities such as 1 or 0.25'
        )
    ),
  }),
})

export type ScalingPolicyFormValues = z.infer<typeof scalingPolicyFormSchema>

const runtimeFormObject = z.looseObject({
  kind: z.enum(RUNTIME_KINDS),
  metadata: z.looseObject({
    name: k8sNameSchema,
    namespace: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    annotations: z.record(z.string(), z.string()).optional(),
  }),
  /** The `ome.io/inherit-from` parent; '' for none. */
  inheritFrom: z.string(),
  /** Whether the runtime carries `ome.io/runtime-profile: "true"`. */
  runtimeProfile: z.boolean(),
  spec: z.looseObject({
    supportedModelFormats: z
      .array(supportedModelFormatSchema)
      .min(1, 'At least one supported model format is required'),
    modelSizeRange: z.looseObject({ min: modelSizeSchema, max: modelSizeSchema }),
    disabled: z.boolean(),
    protocolVersions: z.array(required('Protocol is required')),
    scalingPolicy: scalingPolicyFormSchema,
    engineConfig: componentConfigFormSchema,
    decoderConfig: componentConfigFormSchema,
    routerConfig: componentConfigFormSchema,
  }),
})

export type RuntimeFormValues = z.infer<typeof runtimeFormObject>

export const runtimeFormSchema = runtimeFormObject.superRefine((values, ctx) => {
  const issue = (path: PropertyKey[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message })

  if (values.kind === 'ServingRuntime' && !values.metadata.namespace) {
    issue(['metadata', 'namespace'], 'A ServingRuntime needs a namespace')
  }
  // The webhook rejects a profile that is not disabled.
  if (values.runtimeProfile && !values.spec.disabled) {
    issue(
      ['spec', 'disabled'],
      `A runtime profile (${RUNTIME_PROFILE_ANNOTATION}: "true") must be disabled`
    )
  }
  // The parent is resolved by name among runtimes of the same scope, so the runtime's own name
  // always closes a cycle.
  if (values.inheritFrom && values.inheritFrom === values.metadata.name) {
    issue(['inheritFrom'], 'A runtime cannot inherit from itself')
  }
  const { min, max } = values.spec.modelSizeRange
  if (
    min &&
    max &&
    MODEL_SIZE_PATTERN.test(min) &&
    MODEL_SIZE_PATTERN.test(max) &&
    parseModelSize(min) > parseModelSize(max)
  ) {
    issue(['spec', 'modelSizeRange', 'max'], 'Max size must not be below min size')
  }
})

// ---------------------------------------------------------------------------------------------
// Inheritance
// ---------------------------------------------------------------------------------------------

export interface RuntimeRef {
  kind: RuntimeKind
  name: string
  namespace?: string
}

/**
 * The runtimes `self` may name in `ome.io/inherit-from`, in the order OME resolves the name: a
 * ClusterServingRuntime inherits from ClusterServingRuntimes only; a ServingRuntime from the
 * ServingRuntimes of its own namespace, then from ClusterServingRuntimes, where a namespaced
 * runtime shadows a cluster one of the same name. A runtime's own name always resolves to
 * itself, so it is never a candidate.
 */
export function inheritFromCandidates(
  self: RuntimeRef,
  clusterRuntimes: Runtime[],
  namespacedRuntimes: Runtime[]
): Runtime[] {
  const cluster = clusterRuntimes.filter(
    (runtime) => !runtime.metadata.namespace && runtime.metadata.name !== self.name
  )
  if (self.kind !== 'ServingRuntime') return cluster
  const own = namespacedRuntimes.filter(
    (runtime) =>
      !!self.namespace &&
      runtime.metadata.namespace === self.namespace &&
      runtime.metadata.name !== self.name
  )
  const shadowed = new Set(own.map((runtime) => runtime.metadata.name))
  return [...own, ...cluster.filter((runtime) => !shadowed.has(runtime.metadata.name))]
}
