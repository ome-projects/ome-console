import {
  INHERIT_FROM_ANNOTATION,
  RUNTIME_PROFILE_ANNOTATION,
} from '@/lib/constants/runtime-annotations'
import type { ObjectMeta } from '@/lib/types/common'
import type {
  Runtime,
  ScalingPolicy,
  ServingRuntimeSpec,
  SupportedModelFormat,
} from '@/lib/types/runtime'
import type { ComponentExtensionSpec } from '@/lib/types/service'
import type {
  ComponentConfigFormValues,
  RuntimeFormValues,
  RuntimeKind,
  ScalingPolicyFormValues,
  SupportedModelFormatFormValues,
} from '@/lib/validation/runtime-schema'
import { pruneEmpty, setOrDelete } from '@/lib/utils/object'
import { applyComponentExtension, componentExtensionToForm } from '../shared/componentExtension'

export const RUNTIME_API_VERSION = 'ome.io/v1beta1'

/** Metadata the API server owns; a clone must not carry them into a create. */
const SYSTEM_METADATA_KEYS = [
  'uid',
  'resourceVersion',
  'generation',
  'creationTimestamp',
  'deletionTimestamp',
  'deletionGracePeriodSeconds',
  'managedFields',
  'selfLink',
  'ownerReferences',
]

/**
 * The component fields the form has inputs for. Their untouched inputs are pruned on submit;
 * every other field of a component (containers, tolerations, probes, labels...) is passed
 * through as it was read.
 */
const COMPONENT_FORM_KEYS = [
  'runner',
  'leader',
  'worker',
  'volumes',
  'initContainers',
  'sidecars',
  'config',
] as const

export function emptyModelFormat(): SupportedModelFormatFormValues {
  return { modelFormat: { name: '' }, modelFramework: { name: '' } }
}

function formatToForm(entry: SupportedModelFormat): SupportedModelFormatFormValues {
  return {
    ...entry,
    // Entries written before v1.3 named the format in `name` alone.
    modelFormat: { ...entry.modelFormat, name: entry.modelFormat?.name ?? entry.name ?? '' },
    modelFramework: { ...entry.modelFramework, name: entry.modelFramework?.name ?? '' },
  }
}

export function defaultScalingPolicyFormValues(): ScalingPolicyFormValues {
  return { mode: '', proportional: { anchor: 'engine', ratios: {} } }
}

function scalingPolicyToForm(policy?: ScalingPolicy): ScalingPolicyFormValues {
  const ratios = Object.fromEntries(
    Object.entries(policy?.proportional?.ratios ?? {}).map(([component, ratio]) => [
      component,
      String(ratio),
    ])
  )
  return {
    ...policy,
    mode: policy?.mode ?? '',
    proportional: {
      ...policy?.proportional,
      anchor: policy?.proportional?.anchor ?? 'engine',
      ratios,
    },
  }
}

/** A component config with the autoscaler block in the ComponentExtensionFields form shape. */
function componentToForm(config?: ComponentExtensionSpec): ComponentConfigFormValues {
  return { ...config, ...componentExtensionToForm(config) } as ComponentConfigFormValues
}

export function defaultRuntimeFormValues(): RuntimeFormValues {
  return {
    kind: 'ClusterServingRuntime',
    metadata: { name: '', namespace: '' },
    inheritFrom: '',
    runtimeProfile: false,
    spec: {
      supportedModelFormats: [emptyModelFormat()],
      modelSizeRange: { min: '', max: '' },
      disabled: false,
      protocolVersions: [],
      scalingPolicy: defaultScalingPolicyFormValues(),
      engineConfig: componentToForm(),
      decoderConfig: componentToForm(),
      routerConfig: componentToForm(),
    },
  }
}

/**
 * Form values for an existing runtime (edit and clone): the whole object minus its status, so
 * nothing is lost on the way back, with the annotation-driven fields and the autoscaler blocks
 * in their form shapes.
 */
export function runtimeToFormValues(runtime: Runtime): RuntimeFormValues {
  const { metadata } = runtime
  const spec: Partial<ServingRuntimeSpec> = runtime.spec ?? {}
  const annotations = metadata.annotations ?? {}
  const kind: RuntimeKind =
    runtime.kind === 'ServingRuntime' || metadata.namespace
      ? 'ServingRuntime'
      : 'ClusterServingRuntime'
  return {
    kind,
    metadata: { ...metadata, name: metadata.name ?? '', namespace: metadata.namespace ?? '' },
    inheritFrom: annotations[INHERIT_FROM_ANNOTATION] ?? '',
    runtimeProfile: annotations[RUNTIME_PROFILE_ANNOTATION] === 'true',
    spec: {
      ...spec,
      supportedModelFormats: spec.supportedModelFormats?.length
        ? spec.supportedModelFormats.map(formatToForm)
        : [emptyModelFormat()],
      modelSizeRange: {
        ...spec.modelSizeRange,
        min: spec.modelSizeRange?.min ?? '',
        max: spec.modelSizeRange?.max ?? '',
      },
      disabled: spec.disabled ?? false,
      protocolVersions: spec.protocolVersions ?? [],
      scalingPolicy: scalingPolicyToForm(spec.scalingPolicy),
      engineConfig: componentToForm(spec.engineConfig),
      decoderConfig: componentToForm(spec.decoderConfig),
      routerConfig: componentToForm(spec.routerConfig),
    },
  }
}

export interface BuildRuntimeOptions {
  mode: 'create' | 'edit'
  /** The stored object in edit mode, or the source of a clone. */
  initialData?: Runtime
}

function buildScalingPolicy(
  values: ScalingPolicyFormValues,
  base?: ScalingPolicy
): ScalingPolicy | undefined {
  if (!values.mode) return undefined
  const { mode, proportional: formProportional, ...rest } = values
  const policy: ScalingPolicy = { ...base, ...rest, mode }
  if (mode !== 'Proportional') {
    setOrDelete(policy, 'proportional', base?.proportional)
    return policy
  }
  const { anchor, ratios: formRatios, ...restProportional } = formProportional
  // The anchor drives the followers; a ratio for the anchor itself means nothing.
  const ratios = Object.fromEntries(
    Object.entries(formRatios).filter(([component, ratio]) => component !== anchor && ratio)
  )
  const proportional = { ...base?.proportional, ...restProportional, anchor }
  setOrDelete(proportional, 'ratios', Object.keys(ratios).length > 0 ? ratios : undefined)
  policy.proportional = proportional
  return policy
}

/** Only the fields ComponentExtensionFields owns, so the stored HPA/KEDA details carry over. */
function extensionOf(base?: ComponentExtensionSpec): ComponentExtensionSpec | undefined {
  if (!base) return undefined
  const extension: ComponentExtensionSpec = {}
  setOrDelete(extension, 'minReplicas', base.minReplicas)
  setOrDelete(extension, 'maxReplicas', base.maxReplicas)
  setOrDelete(extension, 'autoscaler', base.autoscaler)
  setOrDelete(extension, 'autoscalerPolicyRef', base.autoscalerPolicyRef)
  return extension
}

function buildComponent<T extends ComponentExtensionSpec>(
  values: ComponentConfigFormValues,
  base?: T
): T | undefined {
  const { minReplicas, maxReplicas, autoscaler, autoscalerPolicyRef, ...rest } = values
  const component: Record<string, unknown> = { ...rest }
  for (const key of COMPONENT_FORM_KEYS) {
    setOrDelete(component, key, pruneEmpty(component[key]))
  }
  Object.assign(
    component,
    applyComponentExtension(extensionOf(base), {
      minReplicas,
      maxReplicas,
      autoscaler,
      autoscalerPolicyRef,
    })
  )
  return Object.keys(component).length > 0 ? (component as T) : undefined
}

/**
 * The runtime object for the form's values. The stored object (edit) or the clone source
 * (create) is the base: the form overwrites the fields it owns and keeps everything else, from
 * metadata.resourceVersion to a container's probes. The scope comes from `kind`, the
 * inheritance annotations from `inheritFrom` and `runtimeProfile`, which also forces
 * `disabled: true` as the webhook requires.
 */
export function buildRuntime(
  values: RuntimeFormValues,
  options: BuildRuntimeOptions = { mode: 'create' }
): Runtime {
  const base = options.initialData
  const { kind, metadata: formMetadata, inheritFrom, runtimeProfile, spec: formSpec } = values
  const namespaced = kind === 'ServingRuntime'

  const metadata: ObjectMeta & Record<string, unknown> = { ...base?.metadata, ...formMetadata }
  if (options.mode === 'create') {
    for (const key of SYSTEM_METADATA_KEYS) delete metadata[key]
  }
  setOrDelete(
    metadata,
    'namespace',
    namespaced && formMetadata.namespace ? formMetadata.namespace : undefined
  )
  const annotations: Record<string, string> = { ...metadata.annotations }
  setOrDelete(annotations, INHERIT_FROM_ANNOTATION, inheritFrom || undefined)
  setOrDelete(annotations, RUNTIME_PROFILE_ANNOTATION, runtimeProfile ? 'true' : undefined)
  setOrDelete(
    metadata,
    'annotations',
    Object.keys(annotations).length > 0 ? annotations : undefined
  )

  const {
    supportedModelFormats,
    modelSizeRange,
    protocolVersions,
    scalingPolicy,
    engineConfig,
    decoderConfig,
    routerConfig,
    ...restSpec
  } = formSpec
  const spec = { ...base?.spec, ...restSpec } as ServingRuntimeSpec
  spec.supportedModelFormats = pruneEmpty(supportedModelFormats) ?? []
  setOrDelete(spec, 'modelSizeRange', pruneEmpty(modelSizeRange))
  setOrDelete(spec, 'protocolVersions', pruneEmpty(protocolVersions))
  setOrDelete(spec, 'scalingPolicy', buildScalingPolicy(scalingPolicy, base?.spec.scalingPolicy))
  setOrDelete(spec, 'engineConfig', buildComponent(engineConfig, base?.spec.engineConfig))
  setOrDelete(spec, 'decoderConfig', buildComponent(decoderConfig, base?.spec.decoderConfig))
  setOrDelete(spec, 'routerConfig', buildComponent(routerConfig, base?.spec.routerConfig))
  if (runtimeProfile) spec.disabled = true

  return { apiVersion: RUNTIME_API_VERSION, kind, metadata, spec }
}
