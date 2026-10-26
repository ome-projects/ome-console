import { describe, it, expect } from 'vitest'
import {
  defaultRuntimeFormValues,
  runtimeToFormValues,
} from '@/components/forms/runtime/runtimeFormValues'
import type { Runtime } from '@/lib/types/runtime'
import {
  MODEL_SIZE_MESSAGE,
  inheritFromCandidates,
  parseModelSize,
  runtimeFormSchema,
  type RuntimeFormValues,
} from './runtime-schema'

function values(change: (values: RuntimeFormValues) => void = () => {}): RuntimeFormValues {
  const result = defaultRuntimeFormValues()
  result.metadata.name = 'vllm'
  result.spec.supportedModelFormats = [
    { modelFormat: { name: 'safetensors' }, modelFramework: { name: 'transformers' } },
  ]
  change(result)
  return result
}

function issues(input: unknown): string[] {
  const result = runtimeFormSchema.safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}

describe('runtimeFormSchema', () => {
  it('accepts a minimal runtime', () => {
    expect(issues(values())).toEqual([])
  })

  it('validates the model size range as <number>[M|B|T] with an uppercase suffix', () => {
    for (const size of ['7B', '350M', '1.5T', '100', '']) {
      expect(issues(values((v) => (v.spec.modelSizeRange = { min: size, max: '' })))).toEqual([])
    }
    for (const size of ['4b', '7 B', 'B', '1.', '1e3', '10GB', '2G', '-1B']) {
      expect(issues(values((v) => (v.spec.modelSizeRange = { min: '', max: size })))).toEqual([
        `spec.modelSizeRange.max: ${MODEL_SIZE_MESSAGE}`,
      ])
    }
    expect(issues(values((v) => (v.spec.modelSizeRange = { min: '8B', max: '2B' })))).toEqual([
      'spec.modelSizeRange.max: Max size must not be below min size',
    ])
    expect(issues(values((v) => (v.spec.modelSizeRange = { min: '500M', max: '1B' })))).toEqual([])
  })

  it('reads sizes as OME does, with values that do not parse as 0', () => {
    expect(parseModelSize('7B')).toBe(7e9)
    expect(parseModelSize('350M')).toBe(350e6)
    expect(parseModelSize('1.5T')).toBe(1.5e12)
    expect(parseModelSize('100')).toBe(100)
    expect(parseModelSize('4b')).toBe(0)
  })

  it('keeps the keys it does not know', () => {
    const runtime: Runtime = {
      apiVersion: 'ome.io/v1beta1',
      kind: 'ClusterServingRuntime',
      metadata: { name: 'vllm', labels: { team: 'a' }, resourceVersion: '7' },
      spec: {
        supportedModelFormats: [
          { modelFormat: { name: 'safetensors' }, modelFramework: { name: 'transformers' } },
        ],
        tolerations: [{ key: 'nvidia.com/gpu', operator: 'Exists' }],
        engineConfig: {
          leader: { runner: { image: 'vllm:leader' } },
          worker: { size: 2 },
          runner: {
            image: 'vllm:latest',
            env: [{ name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf', key: 'token' } } }],
            readinessProbe: { httpGet: { path: '/health', port: 8080 } },
          },
        },
      },
    }
    const result = runtimeFormSchema.safeParse(runtimeToFormValues(runtime))
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      metadata: { labels: { team: 'a' }, resourceVersion: '7' },
      spec: {
        tolerations: [{ key: 'nvidia.com/gpu', operator: 'Exists' }],
        engineConfig: {
          leader: { runner: { image: 'vllm:leader' } },
          worker: { size: 2 },
          runner: {
            env: [{ name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf', key: 'token' } } }],
            readinessProbe: { httpGet: { path: '/health', port: 8080 } },
          },
        },
      },
    })
  })

  it('requires a runtime profile to be disabled', () => {
    expect(issues(values((v) => (v.runtimeProfile = true)))).toEqual([
      'spec.disabled: A runtime profile (ome.io/runtime-profile: "true") must be disabled',
    ])
    expect(
      issues(
        values((v) => {
          v.runtimeProfile = true
          v.spec.disabled = true
        })
      )
    ).toEqual([])
  })

  it('requires a namespace for a ServingRuntime', () => {
    expect(issues(values((v) => (v.kind = 'ServingRuntime')))).toEqual([
      'metadata.namespace: A ServingRuntime needs a namespace',
    ])
    expect(
      issues(
        values((v) => {
          v.kind = 'ServingRuntime'
          v.metadata.namespace = 'team-a'
        })
      )
    ).toEqual([])
  })

  it('rejects a runtime that inherits from itself', () => {
    expect(issues(values((v) => (v.inheritFrom = 'vllm')))).toEqual([
      'inheritFrom: A runtime cannot inherit from itself',
    ])
    expect(issues(values((v) => (v.inheritFrom = 'sglang-profile')))).toEqual([])
  })

  it('requires format and framework names', () => {
    expect(
      issues(
        values((v) => {
          v.spec.supportedModelFormats = [
            { modelFormat: { name: '' }, modelFramework: { name: '' } },
          ]
        })
      )
    ).toEqual([
      'spec.supportedModelFormats.0.modelFormat.name: Format name is required',
      'spec.supportedModelFormats.0.modelFramework.name: Framework name is required',
    ])
  })

  it('bounds a component replicas and requires KEDA triggers', () => {
    expect(
      issues(
        values((v) => {
          v.spec.engineConfig.minReplicas = 3
          v.spec.engineConfig.maxReplicas = 2
        })
      )
    ).toEqual(['spec.engineConfig.minReplicas: Min replicas must not exceed max replicas'])
    expect(issues(values((v) => (v.spec.decoderConfig.autoscaler.class = 'KEDA')))).toEqual([
      'spec.decoderConfig.autoscaler.keda.triggersYaml: KEDA autoscaling needs at least one trigger',
    ])
    expect(
      issues(
        values((v) => {
          v.spec.decoderConfig.autoscaler.class = 'KEDA'
          v.spec.decoderConfig.autoscaler.keda.triggersYaml = '- type: cron\n  metadata: {}'
        })
      )
    ).toEqual([])
  })

  it('validates proportional scaling ratios as quantities', () => {
    expect(
      issues(
        values((v) => {
          v.spec.scalingPolicy = {
            mode: 'Proportional',
            proportional: { anchor: 'engine', ratios: { decoder: 'half' } },
          }
        })
      )
    ).toEqual([
      'spec.scalingPolicy.proportional.ratios.decoder: Ratios are decimal quantities such as 1 or 0.25',
    ])
    expect(
      issues(
        values((v) => {
          v.spec.scalingPolicy = {
            mode: 'Proportional',
            proportional: { anchor: 'engine', ratios: { decoder: '0.25', router: '' } },
          }
        })
      )
    ).toEqual([])
  })
})

describe('inheritFromCandidates', () => {
  const runtime = (kind: string, name: string, namespace?: string): Runtime => ({
    apiVersion: 'ome.io/v1beta1',
    kind,
    metadata: namespace ? { name, namespace } : { name },
    spec: {},
  })
  const key = (candidate: Runtime) =>
    candidate.metadata.namespace
      ? `${candidate.metadata.namespace}/${candidate.metadata.name}`
      : candidate.metadata.name

  const clusterRuntimes = [
    runtime('ClusterServingRuntime', 'base'),
    runtime('ClusterServingRuntime', 'shared'),
    runtime('ClusterServingRuntime', 'self'),
  ]
  const namespacedRuntimes = [
    runtime('ServingRuntime', 'shared', 'team-a'),
    runtime('ServingRuntime', 'child', 'team-a'),
    runtime('ServingRuntime', 'other', 'team-b'),
    runtime('ServingRuntime', 'self', 'team-a'),
  ]

  it('offers a ClusterServingRuntime the other cluster runtimes only', () => {
    const candidates = inheritFromCandidates(
      { kind: 'ClusterServingRuntime', name: 'self' },
      clusterRuntimes,
      namespacedRuntimes
    )
    expect(candidates.map(key)).toEqual(['base', 'shared'])
  })

  it('offers a ServingRuntime its namespace first, then the cluster runtimes it does not shadow', () => {
    const candidates = inheritFromCandidates(
      { kind: 'ServingRuntime', name: 'self', namespace: 'team-a' },
      clusterRuntimes,
      namespacedRuntimes
    )
    expect(candidates.map(key)).toEqual(['team-a/shared', 'team-a/child', 'base'])
  })

  it('offers a ServingRuntime without a namespace yet the cluster runtimes', () => {
    const candidates = inheritFromCandidates(
      { kind: 'ServingRuntime', name: '' },
      clusterRuntimes,
      namespacedRuntimes
    )
    expect(candidates.map(key)).toEqual(['base', 'shared', 'self'])
  })
})
