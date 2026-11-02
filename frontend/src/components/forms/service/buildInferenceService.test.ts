import { describe, it, expect } from 'vitest'
import type { InferenceService } from '@/lib/types/service'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { buildInferenceService } from './buildInferenceService'
import { defaultServiceFormValues } from './serviceFormValues'

function formValues(mutate: (values: ServiceFormValues) => void = () => {}): ServiceFormValues {
  const values = defaultServiceFormValues()
  values.metadata = { name: 'llama', namespace: 'team-a' }
  values.model.name = 'llama-3'
  mutate(values)
  return values
}

describe('buildInferenceService', () => {
  it('writes apiVersion, kind, metadata, the model and an engine, omitting empty optionals', () => {
    expect(buildInferenceService(formValues())).toEqual({
      apiVersion: 'ome.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: 'llama', namespace: 'team-a' },
      spec: { model: { name: 'llama-3' }, engine: {} },
    })
  })

  it('omits spec.runtime for auto-select', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.runtime = { mode: 'auto', name: 'ignored', kind: 'ServingRuntime' }
      })
    )
    expect(service.spec.runtime).toBeUndefined()
  })

  it('writes kind ServingRuntime only for a namespaced runtime', () => {
    const cluster = buildInferenceService(
      formValues((v) => {
        v.runtime = { mode: 'explicit', name: 'vllm', kind: 'ClusterServingRuntime' }
      })
    )
    expect(cluster.spec.runtime).toEqual({ name: 'vllm' })

    const namespaced = buildInferenceService(
      formValues((v) => {
        v.runtime = { mode: 'explicit', name: 'vllm-team', kind: 'ServingRuntime' }
      })
    )
    expect(namespaced.spec.runtime).toEqual({ name: 'vllm-team', kind: 'ServingRuntime' })
  })

  it('writes kind BaseModel only for a namespaced model, with its fine-tuned weights', () => {
    const namespaced = buildInferenceService(
      formValues((v) => {
        v.model = {
          scope: 'namespace',
          name: 'llama-3',
          fineTunedWeights: 'lora-a\nlora-b, lora-c\n',
        }
      })
    )
    expect(namespaced.spec.model).toEqual({
      name: 'llama-3',
      kind: 'BaseModel',
      fineTunedWeights: ['lora-a', 'lora-b', 'lora-c'],
    })
    expect(buildInferenceService(formValues()).spec.model).toEqual({ name: 'llama-3' })
  })

  it('omits spec.model without a model name', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.model.name = ''
        v.runtime = { mode: 'explicit', name: 'vllm', kind: 'ClusterServingRuntime' }
      })
    )
    expect(service.spec.model).toBeUndefined()
    expect(service.spec.runtime).toEqual({ name: 'vllm' })
  })

  it('writes the HPA autoscaler with one CPU utilization metric', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.engine.minReplicas = 1
        v.engine.maxReplicas = 4
        v.engine.autoscaler.class = 'HPA'
        v.engine.autoscaler.hpa.cpuTargetUtilization = 70
      })
    )
    expect(service.spec.engine).toEqual({
      minReplicas: 1,
      maxReplicas: 4,
      autoscaler: {
        class: 'HPA',
        hpa: {
          metrics: [
            {
              type: 'Resource',
              resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } },
            },
          ],
        },
      },
    })

    const bare = buildInferenceService(
      formValues((v) => {
        v.engine.autoscaler.class = 'HPA'
      })
    )
    expect(bare.spec.engine).toEqual({ autoscaler: { class: 'HPA' } })
  })

  it('writes the KEDA autoscaler with its timing and parsed triggers', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.engine.minReplicas = 0
        v.engine.maxReplicas = 3
        v.engine.autoscaler.class = 'KEDA'
        v.engine.autoscaler.keda = {
          pollingInterval: 15,
          cooldownPeriod: 120,
          triggersYaml: '- type: prometheus\n  metadata:\n    query: up\n    threshold: "1"\n',
        }
      })
    )
    expect(service.spec.engine).toEqual({
      minReplicas: 0,
      maxReplicas: 3,
      autoscaler: {
        class: 'KEDA',
        keda: {
          pollingInterval: 15,
          cooldownPeriod: 120,
          triggers: [{ type: 'prometheus', metadata: { query: 'up', threshold: '1' } }],
        },
      },
    })
  })

  it('writes the autoscaler policy reference and the plain classes', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.engine.autoscalerPolicyRef = 'latency-policy'
        v.engine.autoscaler.class = 'None'
      })
    )
    expect(service.spec.engine).toEqual({
      autoscaler: { class: 'None' },
      autoscalerPolicyRef: { name: 'latency-policy' },
    })
  })

  it('writes decoder and router only when enabled', () => {
    const off = buildInferenceService(
      formValues((v) => {
        v.decoder.minReplicas = 2
      })
    )
    expect(off.spec.decoder).toBeUndefined()
    expect(off.spec.router).toBeUndefined()

    const on = buildInferenceService(
      formValues((v) => {
        v.decoder.enabled = true
        v.decoder.minReplicas = 2
        v.router.enabled = true
      })
    )
    expect(on.spec.decoder).toEqual({ minReplicas: 2 })
    expect(on.spec.router).toEqual({})
  })

  it('writes the deployment mode, TTL, accelerator class and lifecycle of every enabled component', () => {
    const service = buildInferenceService(
      formValues((v) => {
        v.deploymentMode = 'OMENative'
        v.router.enabled = true
        v.advanced = {
          ttlSecondsAfterCreation: 3600,
          acceleratorClass: 'h100',
          lifecycle: {
            updateStrategyType: 'RecreatePod',
            minReadySeconds: 30,
            restartPolicy: 'None',
            migrationPolicyMode: 'Never',
          },
        }
      })
    )
    const lifecycle = {
      updateStrategy: { type: 'RecreatePod' },
      minReadySeconds: 30,
      restartPolicy: 'None',
      migrationPolicy: { mode: 'Never' },
    }
    expect(service.spec).toEqual({
      model: { name: 'llama-3' },
      deploymentMode: 'OMENative',
      engine: { lifecycle },
      router: { lifecycle },
      ttlSecondsAfterCreation: 3600,
      acceleratorSelector: { acceleratorClass: 'h100' },
    })
  })

  it('never writes the removed scaling fields', () => {
    const json = JSON.stringify(
      buildInferenceService(
        formValues((v) => {
          v.engine.minReplicas = 1
          v.engine.maxReplicas = 2
          v.engine.autoscaler.class = 'KEDA'
        })
      )
    )
    for (const key of ['replicas', 'scaleTarget', 'scaleMetric', 'kedaConfig']) {
      expect(json).not.toContain(`"${key}"`)
    }
  })

  it('keeps metadata.resourceVersion and every unowned field in edit mode', () => {
    const initialData: InferenceService = {
      apiVersion: 'ome.io/v1beta1',
      kind: 'InferenceService',
      metadata: {
        name: 'llama',
        namespace: 'team-a',
        resourceVersion: '42',
        uid: 'u-1',
        labels: { team: 'a' },
      },
      spec: {
        model: { name: 'old-model', kind: 'BaseModel' },
        runtime: { name: 'vllm', autoSync: false },
        engine: {
          minReplicas: 2,
          maxReplicas: 5,
          runner: { name: 'ome-container', image: 'vllm:1' },
          autoscaler: {
            class: 'HPA',
            hpa: { behavior: { scaleDown: {} }, metrics: [{ type: 'Pods' }] },
          },
        },
        decoder: { minReplicas: 1 },
        traffic: { algorithm: 'LeastRequest' },
      },
      status: { conditions: [] },
    }
    const values = formValues((v) => {
      v.model = { scope: 'cluster', name: 'new-model', fineTunedWeights: '' }
      v.runtime = { mode: 'explicit', name: 'vllm', kind: 'ClusterServingRuntime' }
      v.engine.minReplicas = 3
      v.engine.maxReplicas = undefined
      v.engine.autoscaler.class = 'HPA'
      v.decoder.enabled = false
    })

    const service = buildInferenceService(values, { mode: 'edit', initialData })

    expect(service.metadata).toEqual({
      name: 'llama',
      namespace: 'team-a',
      resourceVersion: '42',
      uid: 'u-1',
      labels: { team: 'a' },
    })
    expect(service.spec.model).toEqual({ name: 'new-model' })
    expect(service.spec.runtime).toEqual({ name: 'vllm', autoSync: false })
    expect(service.spec.engine).toEqual({
      minReplicas: 3,
      runner: { name: 'ome-container', image: 'vllm:1' },
      autoscaler: {
        class: 'HPA',
        hpa: { behavior: { scaleDown: {} }, metrics: [{ type: 'Pods' }] },
      },
    })
    expect(service.spec.decoder).toBeUndefined()
    expect(service.spec.traffic).toEqual({ algorithm: 'LeastRequest' })
    expect(service).not.toHaveProperty('status')
  })
})
