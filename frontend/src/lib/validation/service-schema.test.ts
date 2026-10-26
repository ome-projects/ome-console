import { describe, it, expect } from 'vitest'
import { defaultServiceFormValues } from '@/components/forms/service/serviceFormValues'
import {
  describeIssue,
  inferenceServiceSchema,
  kedaTriggersProblem,
  serviceFormSchema,
} from './service-schema'

type Spec = Record<string, unknown>

function service(spec: Spec, metadata = { name: 'svc', namespace: 'team-a' }) {
  return {
    apiVersion: 'ome.io/v1beta1',
    kind: 'InferenceService',
    metadata,
    spec: { model: { name: 'llama-3' }, engine: {}, ...spec },
  }
}

function issues(input: unknown): string[] {
  const result = inferenceServiceSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map(describeIssue)
}

describe('inferenceServiceSchema', () => {
  it('accepts a minimal service and keeps the keys it does not know', () => {
    const result = inferenceServiceSchema.safeParse(
      service({ traffic: { algorithm: 'Random' }, engine: { runner: { image: 'x' } } })
    )
    expect(result.success).toBe(true)
    expect(result.data?.spec).toMatchObject({
      traffic: { algorithm: 'Random' },
      engine: { runner: { image: 'x' } },
    })
  })

  it('requires a valid name and a namespace', () => {
    expect(issues(service({}, { name: 'Bad_Name', namespace: 'ns' }))).toEqual([
      expect.stringMatching(/^metadata\.name: /),
    ])
    expect(issues(service({}, { name: 'ok', namespace: '' }))).toEqual([
      'metadata.namespace: Namespace is required',
    ])
  })

  it('requires a model or a runtime', () => {
    expect(issues(service({ model: undefined }))).toEqual([
      'spec.model: Set spec.model, spec.runtime, or both',
    ])
    expect(issues(service({ model: undefined, runtime: { name: 'vllm' } }))).toEqual([])
    expect(issues(service({ model: undefined, replicaRefs: { engine: { name: 'r' } } }))).toEqual(
      []
    )
  })

  it('bounds minReplicas and maxReplicas', () => {
    expect(issues(service({ engine: { minReplicas: -1 } }))).toEqual([
      'spec.engine.minReplicas: minReplicas must be 0 or more',
    ])
    expect(issues(service({ engine: { maxReplicas: 0 } }))).toEqual([
      'spec.engine.maxReplicas: maxReplicas must be 1 or more',
    ])
    expect(issues(service({ engine: { minReplicas: 3, maxReplicas: 2 } }))).toEqual([
      'spec.engine.minReplicas: engine: minReplicas must not exceed maxReplicas',
    ])
    expect(issues(service({ engine: { minReplicas: 2, maxReplicas: 2 } }))).toEqual([])
  })

  it('allows scale to zero only with KEDA or an autoscaler policy', () => {
    expect(issues(service({ engine: { minReplicas: 0 } }))).toEqual([
      'spec.engine.minReplicas: engine: minReplicas 0 (scale to zero) requires autoscaler.class KEDA',
    ])
    expect(issues(service({ engine: { minReplicas: 0, autoscaler: { class: 'HPA' } } }))).toEqual([
      expect.stringContaining('requires autoscaler.class KEDA'),
    ])
    expect(
      issues(
        service({
          engine: {
            minReplicas: 0,
            autoscaler: { class: 'KEDA', keda: { triggers: [{ type: 'cron' }] } },
          },
        })
      )
    ).toEqual([])
    expect(
      issues(service({ engine: { minReplicas: 0, autoscalerPolicyRef: { name: 'p' } } }))
    ).toEqual([])
  })

  it('requires a KEDA trigger', () => {
    expect(issues(service({ decoder: { autoscaler: { class: 'KEDA' } } }))).toEqual([
      'spec.decoder.autoscaler.keda.triggers: decoder: KEDA autoscaling needs at least one trigger',
    ])
    expect(
      issues(
        service({
          decoder: { autoscaler: { class: 'KEDA', keda: { triggers: [{ type: 'cron' }] } } },
        })
      )
    ).toEqual([])
  })

  it('accepts minAvailable or maxUnavailable, not both', () => {
    expect(issues(service({ engine: { minAvailable: 1, maxUnavailable: '25%' } }))).toEqual([
      'spec.engine.maxUnavailable: engine: set either minAvailable or maxUnavailable, not both',
    ])
    expect(issues(service({ engine: { minAvailable: 1 } }))).toEqual([])
    expect(issues(service({ engine: { maxUnavailable: '25%' } }))).toEqual([])
  })

  it('requires leader and worker together', () => {
    expect(issues(service({ engine: { leader: {} } }))).toEqual([
      'spec.engine.worker: engine: leader and worker must be set together for multi-node serving',
    ])
    expect(issues(service({ engine: { worker: { size: 2 } } }))).toEqual([
      'spec.engine.leader: engine: leader and worker must be set together for multi-node serving',
    ])
    expect(issues(service({ engine: { leader: {}, worker: { size: 2 } } }))).toEqual([])
  })

  it('requires engine and decoder to agree on the deployment mode', () => {
    expect(
      issues(
        service({
          deploymentMode: 'OMENative',
          decoder: { annotations: { 'ome.io/deploymentMode': 'RawDeployment' } },
        })
      )
    ).toEqual([
      'spec.decoder.annotations.ome.io/deploymentMode: engine (OMENative) and decoder (RawDeployment) must use the same deployment mode',
    ])
    expect(
      issues(
        service({
          engine: { annotations: { 'ome.io/deploymentMode': 'OMENative' } },
          decoder: { annotations: { 'ome.io/deploymentMode': 'OMENative' } },
        })
      )
    ).toEqual([])
    expect(issues(service({ decoder: {} }))).toEqual([])
  })

  it('requires OMENative for rollout groups', () => {
    const rollout = { groups: [{ components: ['engine'], canary: { steps: [] } }] }
    expect(issues(service({ rollout }))).toEqual([
      'spec.rollout.groups.0: Rollout groups need deploymentMode OMENative; engine resolves to the cluster default',
    ])
    expect(issues(service({ deploymentMode: 'RawDeployment', rollout }))).toEqual([
      expect.stringContaining('engine resolves to RawDeployment'),
    ])
    expect(issues(service({ deploymentMode: 'OMENative', rollout }))).toEqual([])
    expect(
      issues(
        service({ engine: { annotations: { 'ome.io/deploymentMode': 'OMENative' } }, rollout })
      )
    ).toEqual([])
  })

  it('bounds the TTL', () => {
    expect(issues(service({ ttlSecondsAfterCreation: 0 }))).toEqual([
      'spec.ttlSecondsAfterCreation: ttlSecondsAfterCreation must be at least 1',
    ])
    expect(issues(service({ ttlSecondsAfterCreation: 60 }))).toEqual([])
  })

  it('rejects a wrong apiVersion or kind but accepts their absence', () => {
    expect(issues({ ...service({}), apiVersion: 'serving.ome.io/v1beta1' })).toEqual([
      expect.stringMatching(/^apiVersion: /),
    ])
    expect(
      issues({ metadata: { name: 'svc', namespace: 'ns' }, spec: { model: { name: 'm' } } })
    ).toEqual([])
  })
})

describe('serviceFormSchema', () => {
  function values() {
    const v = defaultServiceFormValues()
    v.metadata.name = 'svc'
    return v
  }

  it('accepts the defaults with a name', () => {
    expect(serviceFormSchema.safeParse(values()).success).toBe(true)
  })

  it('requires a runtime name in explicit mode', () => {
    const v = values()
    v.runtime.mode = 'explicit'
    const result = serviceFormSchema.safeParse(v)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(describeIssue)).toEqual([
      'runtime.name: Choose a runtime, or switch back to auto-select',
    ])
  })

  it('rejects KEDA triggers that are not a YAML list, for KEDA only', () => {
    const v = values()
    v.engine.autoscaler.class = 'KEDA'
    v.engine.autoscaler.keda.triggersYaml = 'type: prometheus'
    expect(serviceFormSchema.safeParse(v).error?.issues.map(describeIssue)).toEqual([
      expect.stringMatching(
        /^engine\.autoscaler\.keda\.triggersYaml: Triggers must be a YAML list/
      ),
    ])
    v.engine.autoscaler.class = 'HPA'
    expect(serviceFormSchema.safeParse(v).success).toBe(true)
  })

  it('bounds the numeric fields', () => {
    const v = values()
    v.engine.maxReplicas = 0
    v.advanced.ttlSecondsAfterCreation = 0
    expect(serviceFormSchema.safeParse(v).error?.issues.map(describeIssue)).toEqual([
      'engine.maxReplicas: Max replicas must be 1 or more',
      'advanced.ttlSecondsAfterCreation: TTL must be at least 1 second',
    ])
  })
})

describe('kedaTriggersProblem', () => {
  it('accepts empty text and a list of objects', () => {
    expect(kedaTriggersProblem('')).toBeNull()
    expect(kedaTriggersProblem('- type: cron\n  metadata: {}\n')).toBeNull()
  })

  it('reports invalid YAML and non-list documents', () => {
    expect(kedaTriggersProblem('- [')).toMatch(/^Triggers must be valid YAML/)
    expect(kedaTriggersProblem('- just a string')).toMatch(/^Triggers must be a YAML list/)
  })
})
