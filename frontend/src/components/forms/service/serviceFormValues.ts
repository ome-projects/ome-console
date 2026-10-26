import type { InferenceService, LifecycleSpec } from '@/lib/types/service'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import {
  componentExtensionToForm,
  defaultComponentExtensionFormValues,
} from '../shared/componentExtension'

export const DEFAULT_NAMESPACE = 'default'

export function defaultServiceFormValues(): ServiceFormValues {
  return {
    metadata: { name: '', namespace: DEFAULT_NAMESPACE },
    model: { scope: 'cluster', name: '', fineTunedWeights: '' },
    runtime: { mode: 'auto', name: '', kind: 'ClusterServingRuntime' },
    deploymentMode: '',
    engine: defaultComponentExtensionFormValues(),
    decoder: { enabled: false, ...defaultComponentExtensionFormValues() },
    router: { enabled: false, ...defaultComponentExtensionFormValues() },
    advanced: {
      ttlSecondsAfterCreation: undefined,
      acceleratorClass: '',
      lifecycle: {
        updateStrategyType: '',
        minReadySeconds: undefined,
        restartPolicy: '',
        migrationPolicyMode: '',
      },
    },
  }
}

function lifecycleToForm(lifecycle?: LifecycleSpec): ServiceFormValues['advanced']['lifecycle'] {
  return {
    updateStrategyType: lifecycle?.updateStrategy?.type ?? '',
    minReadySeconds: lifecycle?.minReadySeconds,
    restartPolicy: lifecycle?.restartPolicy ?? '',
    migrationPolicyMode: lifecycle?.migrationPolicy?.mode ?? '',
  }
}

/** Form values for an existing service (edit mode). Fields the form does not own stay on the object. */
export function serviceToFormValues(service: InferenceService): ServiceFormValues {
  const { spec } = service
  const values = defaultServiceFormValues()
  values.metadata = {
    name: service.metadata.name,
    namespace: service.metadata.namespace ?? DEFAULT_NAMESPACE,
  }
  values.model = {
    scope: spec.model?.kind === 'BaseModel' ? 'namespace' : 'cluster',
    name: spec.model?.name ?? '',
    fineTunedWeights: (spec.model?.fineTunedWeights ?? []).join('\n'),
  }
  values.runtime = spec.runtime?.name
    ? {
        mode: 'explicit',
        name: spec.runtime.name,
        kind: spec.runtime.kind === 'ServingRuntime' ? 'ServingRuntime' : 'ClusterServingRuntime',
      }
    : { mode: 'auto', name: '', kind: 'ClusterServingRuntime' }
  values.deploymentMode = spec.deploymentMode ?? ''
  values.engine = componentExtensionToForm(spec.engine)
  values.decoder = { enabled: !!spec.decoder, ...componentExtensionToForm(spec.decoder) }
  values.router = { enabled: !!spec.router, ...componentExtensionToForm(spec.router) }
  values.advanced = {
    ttlSecondsAfterCreation: spec.ttlSecondsAfterCreation,
    acceleratorClass: spec.acceleratorSelector?.acceleratorClass ?? '',
    lifecycle: lifecycleToForm(spec.engine?.lifecycle),
  }
  return values
}
