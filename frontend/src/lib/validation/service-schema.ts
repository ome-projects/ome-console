import { z } from 'zod'
import yaml from 'js-yaml'
import {
  ComponentAutoscalerClassValues,
  InferenceServiceSpecDeploymentModeValues,
  LifecycleSpecRestartPolicyValues,
  MigrationPolicyModeValues,
  UpdateStrategyTypeValues,
} from '../types/generated/ome.v1beta1'
import { isPlainObject } from '../utils/object'

export const K8S_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

export const k8sNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(253, 'Name must be at most 253 characters')
  .regex(
    K8S_NAME_PATTERN,
    'Use lowercase letters, digits and dashes, starting and ending with a letter or digit'
  )

// ---------------------------------------------------------------------------------------------
// The InferenceService object, as sent to the API. `z.looseObject` keeps every key the form does
// not know about, so a YAML-authored spec survives validation intact. The cross-field rules
// mirror OME's validating webhook; the server's dry run stays the authority.
// ---------------------------------------------------------------------------------------------

const intOrString = z.union([z.number().int(), z.string()])
const opaque = z.record(z.string(), z.unknown())

const autoscalerSchema = z.looseObject({
  class: z.enum(ComponentAutoscalerClassValues),
  hpa: z.looseObject({ metrics: z.array(opaque).optional() }).optional(),
  keda: z
    .looseObject({
      triggers: z.array(opaque).optional(),
      pollingInterval: z.number().int().min(0).optional(),
      cooldownPeriod: z.number().int().min(0).optional(),
    })
    .optional(),
})

const lifecycleSchema = z.looseObject({
  updateStrategy: z.looseObject({ type: z.enum(UpdateStrategyTypeValues).optional() }).optional(),
  minReadySeconds: z.number().int().min(0).optional(),
  restartPolicy: z.enum(LifecycleSpecRestartPolicyValues).optional(),
  migrationPolicy: z.looseObject({ mode: z.enum(MigrationPolicyModeValues).optional() }).optional(),
})

export const componentSpecSchema = z.looseObject({
  minReplicas: z.number().int().min(0, 'minReplicas must be 0 or more').optional(),
  maxReplicas: z.number().int().min(1, 'maxReplicas must be 1 or more').optional(),
  minAvailable: intOrString.optional(),
  maxUnavailable: intOrString.optional(),
  annotations: z.record(z.string(), z.string()).optional(),
  autoscaler: autoscalerSchema.optional(),
  autoscalerPolicyRef: z
    .looseObject({ name: z.string().optional(), kind: z.string().optional() })
    .optional(),
  leader: opaque.optional(),
  worker: opaque.optional(),
  lifecycle: lifecycleSchema.optional(),
})

const rolloutGroupSchema = z.looseObject({
  components: z.array(z.string()).optional(),
})

const inferenceServiceSpecSchema = z.looseObject({
  model: z
    .looseObject({
      name: z.string().optional(),
      kind: z.string().optional(),
      fineTunedWeights: z.array(z.string()).optional(),
    })
    .optional(),
  runtime: z.looseObject({ name: z.string().optional(), kind: z.string().optional() }).optional(),
  deploymentMode: z.enum(InferenceServiceSpecDeploymentModeValues).optional(),
  engine: componentSpecSchema.optional(),
  decoder: componentSpecSchema.optional(),
  router: componentSpecSchema.optional(),
  replicaRefs: opaque.optional(),
  rollout: z.looseObject({ groups: z.array(rolloutGroupSchema).optional() }).optional(),
  ttlSecondsAfterCreation: z
    .number()
    .int()
    .min(1, 'ttlSecondsAfterCreation must be at least 1')
    .optional(),
  acceleratorSelector: z.looseObject({ acceleratorClass: z.string().optional() }).optional(),
})

type SpecInput = z.infer<typeof inferenceServiceSpecSchema>

export const COMPONENT_NAMES = ['engine', 'decoder', 'router'] as const
export type ComponentName = (typeof COMPONENT_NAMES)[number]

function isComponentName(name: string): name is ComponentName {
  return (COMPONENT_NAMES as readonly string[]).includes(name)
}

/** The deployment mode a component resolves to: its annotation, else the service-level mode. */
function componentMode(spec: SpecInput, name: string): string | undefined {
  if (!isComponentName(name)) return spec.deploymentMode
  return spec[name]?.annotations?.['ome.io/deploymentMode'] ?? spec.deploymentMode
}

export const inferenceServiceSchema = z
  .looseObject({
    apiVersion: z.literal('ome.io/v1beta1').optional(),
    kind: z.literal('InferenceService').optional(),
    metadata: z.looseObject({
      name: k8sNameSchema,
      namespace: z.string().min(1, 'Namespace is required'),
    }),
    spec: inferenceServiceSpecSchema,
  })
  .superRefine((service, ctx) => {
    const issue = (path: PropertyKey[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    const spec = service.spec

    if (!spec.replicaRefs && !spec.model?.name && !spec.runtime?.name) {
      issue(['spec', 'model'], 'Set spec.model, spec.runtime, or both')
    }

    for (const name of COMPONENT_NAMES) {
      const component = spec[name]
      if (!component) continue
      const path = ['spec', name]

      if (
        component.minReplicas !== undefined &&
        component.maxReplicas !== undefined &&
        component.minReplicas > component.maxReplicas
      ) {
        issue([...path, 'minReplicas'], `${name}: minReplicas must not exceed maxReplicas`)
      }
      if (
        component.minReplicas === 0 &&
        component.autoscaler?.class !== 'KEDA' &&
        !component.autoscalerPolicyRef?.name
      ) {
        issue(
          [...path, 'minReplicas'],
          `${name}: minReplicas 0 (scale to zero) requires autoscaler.class KEDA`
        )
      }
      if (component.autoscaler?.class === 'KEDA' && !component.autoscaler.keda?.triggers?.length) {
        issue(
          [...path, 'autoscaler', 'keda', 'triggers'],
          `${name}: KEDA autoscaling needs at least one trigger`
        )
      }
      if (component.minAvailable !== undefined && component.maxUnavailable !== undefined) {
        issue(
          [...path, 'maxUnavailable'],
          `${name}: set either minAvailable or maxUnavailable, not both`
        )
      }
      if ((component.leader === undefined) !== (component.worker === undefined)) {
        issue(
          [...path, component.leader ? 'worker' : 'leader'],
          `${name}: leader and worker must be set together for multi-node serving`
        )
      }
    }

    if (spec.engine && spec.decoder) {
      const engineMode = componentMode(spec, 'engine')
      const decoderMode = componentMode(spec, 'decoder')
      if (engineMode && decoderMode && engineMode !== decoderMode) {
        issue(
          ['spec', 'decoder', 'annotations', 'ome.io/deploymentMode'],
          `engine (${engineMode}) and decoder (${decoderMode}) must use the same deployment mode`
        )
      }
    }

    spec.rollout?.groups?.forEach((group, index) => {
      for (const name of group.components ?? []) {
        const mode = componentMode(spec, name)
        if (mode !== 'OMENative') {
          issue(
            ['spec', 'rollout', 'groups', index],
            `Rollout groups need deploymentMode OMENative; ${name} resolves to ${mode ?? 'the cluster default'}`
          )
        }
      }
    })
  })

export type InferenceServiceInput = z.input<typeof inferenceServiceSchema>

export interface ValidationIssue {
  path: PropertyKey[]
  message: string
}

/** `spec.engine.minReplicas: message`, as the form lists issues. */
export function describeIssue(issue: ValidationIssue): string {
  const path = issue.path.map(String).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

// ---------------------------------------------------------------------------------------------
// Form values. Numbers are optional (an empty input is undefined); selects use '' for "unset".
// ---------------------------------------------------------------------------------------------

const optionalInt = (min: number, message: string) =>
  z.number().int('Must be a whole number').min(min, message).optional()

/** Why `text` is not a KEDA trigger list, or null when it is (or is empty). */
export function kedaTriggersProblem(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = yaml.load(trimmed)
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return `Triggers must be valid YAML: ${reason}`
  }
  if (!Array.isArray(parsed) || !parsed.every(isPlainObject)) {
    return 'Triggers must be a YAML list of trigger objects, each with a type and metadata'
  }
  return null
}

const componentExtensionFormShape = {
  minReplicas: optionalInt(0, 'Min replicas must be 0 or more'),
  maxReplicas: optionalInt(1, 'Max replicas must be 1 or more'),
  autoscaler: z.object({
    class: z.enum(ComponentAutoscalerClassValues).or(z.literal('')),
    hpa: z.object({
      cpuTargetUtilization: z
        .number()
        .int('Must be a whole number')
        .min(1, 'CPU target must be between 1 and 100')
        .max(100, 'CPU target must be between 1 and 100')
        .optional(),
    }),
    keda: z.object({
      pollingInterval: optionalInt(0, 'Polling interval must be 0 or more'),
      cooldownPeriod: optionalInt(0, 'Cooldown period must be 0 or more'),
      /** KEDA triggers as a YAML list, passed through verbatim. */
      triggersYaml: z.string(),
    }),
  }),
  /** Name of an AutoscalerPolicy in the namespace; '' for none. */
  autoscalerPolicyRef: z.string(),
}

export const componentExtensionFormSchema = z.object(componentExtensionFormShape)
export type ComponentExtensionFormValues = z.infer<typeof componentExtensionFormSchema>

function checkComponentExtensionForm(
  values: ComponentExtensionFormValues,
  ctx: z.RefinementCtx
): void {
  if (values.autoscaler.class !== 'KEDA') return
  const problem = kedaTriggersProblem(values.autoscaler.keda.triggersYaml)
  if (problem) {
    ctx.addIssue({ code: 'custom', path: ['autoscaler', 'keda', 'triggersYaml'], message: problem })
  }
}

const engineFormSchema = componentExtensionFormSchema.superRefine(checkComponentExtensionForm)

const optionalComponentFormSchema = z
  .object({ enabled: z.boolean(), ...componentExtensionFormShape })
  .superRefine((values, ctx) => {
    if (values.enabled) checkComponentExtensionForm(values, ctx)
  })

export const serviceFormSchema = z
  .object({
    metadata: z.object({
      name: k8sNameSchema,
      namespace: z.string().min(1, 'Namespace is required'),
    }),
    model: z.object({
      /** Cluster scope writes `spec.model.name` only; namespace scope adds `kind: BaseModel`. */
      scope: z.enum(['cluster', 'namespace']),
      name: z.string(),
      /** FineTunedWeight names, one per line or comma-separated. */
      fineTunedWeights: z.string(),
    }),
    runtime: z.object({
      /** `auto` omits `spec.runtime` so OME picks the runtime at admission time. */
      mode: z.enum(['auto', 'explicit']),
      name: z.string(),
      kind: z.enum(['ClusterServingRuntime', 'ServingRuntime']),
    }),
    deploymentMode: z.enum(InferenceServiceSpecDeploymentModeValues).or(z.literal('')),
    engine: engineFormSchema,
    decoder: optionalComponentFormSchema,
    router: optionalComponentFormSchema,
    advanced: z.object({
      ttlSecondsAfterCreation: optionalInt(1, 'TTL must be at least 1 second'),
      acceleratorClass: z.string(),
      lifecycle: z.object({
        updateStrategyType: z.enum(UpdateStrategyTypeValues).or(z.literal('')),
        minReadySeconds: optionalInt(0, 'Min ready seconds must be 0 or more'),
        restartPolicy: z.enum(LifecycleSpecRestartPolicyValues).or(z.literal('')),
        migrationPolicyMode: z.enum(MigrationPolicyModeValues).or(z.literal('')),
      }),
    }),
  })
  .superRefine((values, ctx) => {
    if (values.runtime.mode === 'explicit' && !values.runtime.name) {
      ctx.addIssue({
        code: 'custom',
        path: ['runtime', 'name'],
        message: 'Choose a runtime, or switch back to auto-select',
      })
    }
  })

export type ServiceFormValues = z.infer<typeof serviceFormSchema>
export type OptionalComponentFormValues = ServiceFormValues['decoder']
