import yaml from 'js-yaml'
import type {
  ComponentAutoscaler,
  ComponentExtensionSpec,
  KedaAutoscaler,
} from '@/lib/types/service'
import type { ComponentExtensionFormValues } from '@/lib/validation/service-schema'
import { isPlainObject, setOrDelete } from '@/lib/utils/object'

/**
 * Conversions between the ComponentExtensionFields form values and a component spec. Shared by
 * the service form (spec.engine/decoder/router) and, later, the runtime form (engineConfig...),
 * which carry the same ComponentExtensionSpec fields.
 */

export function defaultComponentExtensionFormValues(): ComponentExtensionFormValues {
  return {
    minReplicas: undefined,
    maxReplicas: undefined,
    autoscaler: {
      class: '',
      hpa: { cpuTargetUtilization: undefined },
      keda: { pollingInterval: undefined, cooldownPeriod: undefined, triggersYaml: '' },
    },
    autoscalerPolicyRef: '',
  }
}

/** The one HPA metric the form writes: CPU utilization as a percentage. */
export function cpuUtilizationMetric(averageUtilization: number): Record<string, unknown> {
  return {
    type: 'Resource',
    resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization } },
  }
}

/** The CPU target when the HPA metrics are exactly the entry `cpuUtilizationMetric` writes. */
function cpuUtilizationTarget(metrics?: Record<string, unknown>[]): number | undefined {
  if (!metrics || metrics.length !== 1) return undefined
  const [metric] = metrics
  if (metric.type !== 'Resource' || !isPlainObject(metric.resource)) return undefined
  const { name, target } = metric.resource
  if (name !== 'cpu' || !isPlainObject(target) || target.type !== 'Utilization') return undefined
  return typeof target.averageUtilization === 'number' ? target.averageUtilization : undefined
}

/** Parses the triggers YAML list; empty text is an empty list. Throws on invalid YAML. */
export function parseKedaTriggers(text: string): Record<string, unknown>[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parsed = yaml.load(trimmed)
  if (!Array.isArray(parsed)) throw new Error('KEDA triggers must be a YAML list')
  return parsed.filter(isPlainObject)
}

export function dumpKedaTriggers(triggers: Record<string, unknown>[]): string {
  return yaml.dump(triggers, { indent: 2, lineWidth: -1, noRefs: true, skipInvalid: true })
}

/** Form values for an existing component spec (edit mode). */
export function componentExtensionToForm(
  spec?: ComponentExtensionSpec
): ComponentExtensionFormValues {
  const values = defaultComponentExtensionFormValues()
  if (!spec) return values
  values.minReplicas = spec.minReplicas
  values.maxReplicas = spec.maxReplicas
  values.autoscalerPolicyRef = spec.autoscalerPolicyRef?.name ?? ''
  const autoscaler = spec.autoscaler
  if (autoscaler) {
    values.autoscaler.class = autoscaler.class
    values.autoscaler.hpa.cpuTargetUtilization = cpuUtilizationTarget(autoscaler.hpa?.metrics)
    values.autoscaler.keda.pollingInterval = autoscaler.keda?.pollingInterval
    values.autoscaler.keda.cooldownPeriod = autoscaler.keda?.cooldownPeriod
    values.autoscaler.keda.triggersYaml = autoscaler.keda?.triggers?.length
      ? dumpKedaTriggers(autoscaler.keda.triggers)
      : ''
  }
  return values
}

function buildAutoscaler(
  values: ComponentExtensionFormValues['autoscaler'],
  base?: ComponentAutoscaler
): ComponentAutoscaler | undefined {
  if (!values.class) return undefined
  // Settings of another class never carry over; of the same class, the form overlays its fields.
  const kept = base?.class === values.class ? base : undefined
  switch (values.class) {
    case 'HPA': {
      const target = values.hpa.cpuTargetUtilization
      const hpa =
        target !== undefined ? { ...kept?.hpa, metrics: [cpuUtilizationMetric(target)] } : kept?.hpa
      return hpa ? { class: 'HPA', hpa } : { class: 'HPA' }
    }
    case 'KEDA': {
      const keda: KedaAutoscaler = {
        ...kept?.keda,
        triggers: parseKedaTriggers(values.keda.triggersYaml),
      }
      setOrDelete(keda, 'pollingInterval', values.keda.pollingInterval)
      setOrDelete(keda, 'cooldownPeriod', values.keda.cooldownPeriod)
      return { class: 'KEDA', keda }
    }
    default:
      return { class: values.class }
  }
}

/**
 * Writes the form's fields onto a component spec. A field left empty removes its key; every key
 * the form does not own (containers, runner, env, leader/worker...) is kept from `base`.
 */
export function applyComponentExtension<T extends ComponentExtensionSpec>(
  base: T | undefined,
  values: ComponentExtensionFormValues
): T {
  const out = { ...(base ?? {}) } as T
  setOrDelete(out, 'minReplicas', values.minReplicas)
  setOrDelete(out, 'maxReplicas', values.maxReplicas)
  setOrDelete(out, 'autoscaler', buildAutoscaler(values.autoscaler, base?.autoscaler))
  setOrDelete(
    out,
    'autoscalerPolicyRef',
    values.autoscalerPolicyRef
      ? { ...base?.autoscalerPolicyRef, name: values.autoscalerPolicyRef }
      : undefined
  )
  return out
}
