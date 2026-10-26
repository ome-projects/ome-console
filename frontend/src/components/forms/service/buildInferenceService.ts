import type {
  ComponentExtensionSpec,
  InferenceService,
  InferenceServiceSpec,
  LifecycleSpec,
  ModelRef,
  ServingRuntimeRef,
} from '@/lib/types/service'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { compact, setOrDelete } from '@/lib/utils/object'
import { applyComponentExtension } from '../shared/componentExtension'

export const INFERENCE_SERVICE_API_VERSION = 'ome.io/v1beta1'
export const INFERENCE_SERVICE_KIND = 'InferenceService'

export interface BuildOptions {
  mode: 'create' | 'edit'
  /** The stored object in edit mode: its metadata (resourceVersion, labels...) and every spec field the form does not own are kept. */
  initialData?: InferenceService
}

/** FineTunedWeight names from the textarea: one per line or comma-separated. */
export function splitNames(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildModelRef(values: ServiceFormValues['model'], base?: ModelRef): ModelRef | undefined {
  if (!values.name) return undefined
  const ref: ModelRef = { ...base, name: values.name }
  // A cluster model is the default kind; only a namespaced BaseModel needs the kind written.
  setOrDelete(ref, 'kind', values.scope === 'namespace' ? 'BaseModel' : undefined)
  const weights = splitNames(values.fineTunedWeights)
  setOrDelete(ref, 'fineTunedWeights', weights.length > 0 ? weights : undefined)
  return ref
}

function buildRuntimeRef(
  values: ServiceFormValues['runtime'],
  base?: ServingRuntimeRef
): ServingRuntimeRef | undefined {
  if (values.mode !== 'explicit' || !values.name) return undefined
  const ref: ServingRuntimeRef = { ...base, name: values.name }
  // An omitted kind means ClusterServingRuntime; namespaced runtimes must say so.
  setOrDelete(ref, 'kind', values.kind === 'ServingRuntime' ? 'ServingRuntime' : undefined)
  return ref
}

function buildLifecycle(
  values: ServiceFormValues['advanced']['lifecycle'],
  base?: LifecycleSpec
): LifecycleSpec | undefined {
  const lifecycle: LifecycleSpec = { ...base }
  setOrDelete(
    lifecycle,
    'updateStrategy',
    compact({ ...base?.updateStrategy, type: values.updateStrategyType || undefined })
  )
  setOrDelete(lifecycle, 'minReadySeconds', values.minReadySeconds)
  setOrDelete(lifecycle, 'restartPolicy', values.restartPolicy || undefined)
  setOrDelete(
    lifecycle,
    'migrationPolicy',
    compact({ ...base?.migrationPolicy, mode: values.migrationPolicyMode || undefined })
  )
  return compact(lifecycle)
}

function buildComponent<T extends ComponentExtensionSpec>(
  values: ServiceFormValues['engine'],
  lifecycle: ServiceFormValues['advanced']['lifecycle'],
  base?: T
): T {
  const component = applyComponentExtension(base, values)
  setOrDelete(component, 'lifecycle', buildLifecycle(lifecycle, base?.lifecycle))
  return component
}

/**
 * The InferenceService for the form's values. In edit mode the stored object is the base: the
 * form overwrites the fields it owns and keeps everything else (metadata.resourceVersion,
 * containers, overlays, rollout, traffic, placement...). Never writes the removed `replicas`,
 * `scaleTarget`, `scaleMetric` or `kedaConfig` fields, and omits optional sub-objects that
 * would be empty.
 */
export function buildInferenceService(
  values: ServiceFormValues,
  options: BuildOptions = { mode: 'create' }
): InferenceService {
  const base = options.mode === 'edit' ? options.initialData : undefined
  const spec: InferenceServiceSpec = { ...base?.spec }

  setOrDelete(spec, 'model', buildModelRef(values.model, base?.spec.model))
  setOrDelete(spec, 'runtime', buildRuntimeRef(values.runtime, base?.spec.runtime))
  setOrDelete(spec, 'deploymentMode', values.deploymentMode || undefined)

  // The engine is the one component every service has; decoder and router are opt-in.
  spec.engine = buildComponent(values.engine, values.advanced.lifecycle, base?.spec.engine)
  setOrDelete(
    spec,
    'decoder',
    values.decoder.enabled
      ? buildComponent(values.decoder, values.advanced.lifecycle, base?.spec.decoder)
      : undefined
  )
  setOrDelete(
    spec,
    'router',
    values.router.enabled
      ? buildComponent(values.router, values.advanced.lifecycle, base?.spec.router)
      : undefined
  )

  setOrDelete(spec, 'ttlSecondsAfterCreation', values.advanced.ttlSecondsAfterCreation)
  setOrDelete(
    spec,
    'acceleratorSelector',
    compact({
      ...base?.spec.acceleratorSelector,
      acceleratorClass: values.advanced.acceleratorClass || undefined,
    })
  )

  return {
    apiVersion: INFERENCE_SERVICE_API_VERSION,
    kind: INFERENCE_SERVICE_KIND,
    metadata: {
      ...base?.metadata,
      name: values.metadata.name,
      namespace: values.metadata.namespace,
    },
    spec,
  }
}
