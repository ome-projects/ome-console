import { describe, it, expect } from 'vitest'
import type { Runtime } from '@/lib/types/runtime'
import { buildRuntime, defaultRuntimeFormValues, runtimeToFormValues } from './runtimeFormValues'

const stored: Runtime = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'ClusterServingRuntime',
  metadata: {
    name: 'vllm',
    uid: 'u-1',
    resourceVersion: '42',
    creationTimestamp: '2026-01-01T00:00:00Z',
    labels: { team: 'a' },
    annotations: { 'ome.io/inherit-from': 'sglang-profile', 'team/owner': 'ml' },
  },
  spec: {
    supportedModelFormats: [
      { modelFormat: { name: 'safetensors' }, modelFramework: { name: 'transformers' } },
    ],
    modelSizeRange: { min: '1B', max: '70B' },
    tolerations: [{ key: 'nvidia.com/gpu', operator: 'Exists' }],
    engineConfig: {
      minReplicas: 1,
      maxReplicas: 3,
      autoscaler: {
        class: 'HPA',
        hpa: {
          metrics: [
            {
              type: 'Resource',
              resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 60 } },
            },
          ],
          behavior: { scaleDown: { stabilizationWindowSeconds: 300 } },
        },
      },
      leader: { runner: { image: 'vllm:leader' } },
      worker: { size: 2, runner: { image: 'vllm:worker' } },
      runner: {
        name: 'ome-container',
        image: 'vllm:latest',
        env: [{ name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf', key: 'token' } } }],
        readinessProbe: { httpGet: { path: '/health', port: 8080 } },
      },
      volumes: [{ name: 'dshm', emptyDir: { medium: 'Memory' } }],
    },
  },
}

describe('runtimeToFormValues', () => {
  it('derives the scope and the annotation fields and keeps the rest', () => {
    const values = runtimeToFormValues(stored)
    expect(values.kind).toBe('ClusterServingRuntime')
    expect(values.inheritFrom).toBe('sglang-profile')
    expect(values.runtimeProfile).toBe(false)
    expect(values.metadata).toMatchObject({ name: 'vllm', namespace: '', resourceVersion: '42' })
    expect(values.spec.engineConfig).toMatchObject({
      minReplicas: 1,
      maxReplicas: 3,
      autoscaler: { class: 'HPA', hpa: { cpuTargetUtilization: 60 } },
      autoscalerPolicyRef: '',
      leader: { runner: { image: 'vllm:leader' } },
      runner: { env: [{ name: 'HF_TOKEN' }] },
    })
    expect(values.spec.scalingPolicy).toEqual({
      mode: '',
      proportional: { anchor: 'engine', ratios: {} },
    })
  })

  it('treats a namespaced runtime as a ServingRuntime and maps a legacy format name', () => {
    const values = runtimeToFormValues({
      ...stored,
      kind: 'ServingRuntime',
      metadata: { name: 'vllm', namespace: 'team-a' },
      spec: { supportedModelFormats: [{ name: 'safetensors' } as never] },
    })
    expect(values.kind).toBe('ServingRuntime')
    expect(values.metadata.namespace).toBe('team-a')
    expect(values.spec.supportedModelFormats).toEqual([
      { name: 'safetensors', modelFormat: { name: 'safetensors' }, modelFramework: { name: '' } },
    ])
  })
})

describe('buildRuntime', () => {
  it('writes a new ServingRuntime from the form, without the untouched inputs', () => {
    const values = defaultRuntimeFormValues()
    values.kind = 'ServingRuntime'
    values.metadata = { name: 'new', namespace: 'team-a' }
    values.spec.supportedModelFormats = [
      {
        modelFormat: { name: 'safetensors', version: '' },
        modelFramework: { name: 'transformers' },
        quantization: '',
        priority: undefined,
      },
    ]
    values.spec.engineConfig.minReplicas = 2
    values.spec.engineConfig.runner = {
      name: '',
      image: '',
      resources: { requests: { cpu: '', memory: '' } },
    }
    expect(buildRuntime(values)).toEqual({
      apiVersion: 'ome.io/v1beta1',
      kind: 'ServingRuntime',
      metadata: { name: 'new', namespace: 'team-a' },
      spec: {
        supportedModelFormats: [
          { modelFormat: { name: 'safetensors' }, modelFramework: { name: 'transformers' } },
        ],
        disabled: false,
        engineConfig: { minReplicas: 2 },
      },
    })
  })

  it('drops the namespace of a ClusterServingRuntime', () => {
    const values = defaultRuntimeFormValues()
    values.metadata = { name: 'new', namespace: 'team-a' }
    expect(buildRuntime(values).metadata).toEqual({ name: 'new' })
  })

  it('edits losslessly: keeps resourceVersion, labels and every field without an input', () => {
    const values = runtimeToFormValues(stored)
    values.spec.modelSizeRange.max = '8B'
    values.spec.engineConfig.autoscaler.hpa.cpuTargetUtilization = 75
    const runtime = buildRuntime(values, { mode: 'edit', initialData: stored })
    expect(runtime.metadata).toEqual(stored.metadata)
    expect(runtime.spec).toEqual({
      ...stored.spec,
      disabled: false,
      modelSizeRange: { min: '1B', max: '8B' },
      engineConfig: {
        ...stored.spec.engineConfig,
        autoscaler: {
          class: 'HPA',
          hpa: {
            metrics: [
              {
                type: 'Resource',
                resource: {
                  name: 'cpu',
                  target: { type: 'Utilization', averageUtilization: 75 },
                },
              },
            ],
            behavior: { scaleDown: { stabilizationWindowSeconds: 300 } },
          },
        },
      },
    })
  })

  it('writes the inheritance annotations and forces a profile to be disabled', () => {
    const values = runtimeToFormValues(stored)
    values.inheritFrom = ''
    values.runtimeProfile = true
    const runtime = buildRuntime(values, { mode: 'edit', initialData: stored })
    expect(runtime.metadata.annotations).toEqual({
      'team/owner': 'ml',
      'ome.io/runtime-profile': 'true',
    })
    expect(runtime.spec.disabled).toBe(true)
  })

  it('clones without the server-managed metadata', () => {
    const values = runtimeToFormValues({ ...stored, metadata: { ...stored.metadata, name: '' } })
    values.metadata.name = 'vllm-copy'
    const runtime = buildRuntime(values, { mode: 'create', initialData: stored })
    expect(runtime.metadata).toEqual({
      name: 'vllm-copy',
      labels: { team: 'a' },
      annotations: stored.metadata.annotations,
    })
    expect(runtime.spec.engineConfig).toEqual(stored.spec.engineConfig)
  })

  it('writes the scaling policy with the follower ratios only', () => {
    const values = defaultRuntimeFormValues()
    values.metadata.name = 'new'
    values.spec.scalingPolicy = {
      mode: 'Proportional',
      proportional: { anchor: 'decoder', ratios: { engine: '1', decoder: '2', router: '' } },
    }
    expect(buildRuntime(values).spec.scalingPolicy).toEqual({
      mode: 'Proportional',
      proportional: { anchor: 'decoder', ratios: { engine: '1' } },
    })
    values.spec.scalingPolicy.mode = 'Independent'
    expect(buildRuntime(values).spec.scalingPolicy).toEqual({ mode: 'Independent' })
    values.spec.scalingPolicy.mode = ''
    expect(buildRuntime(values).spec.scalingPolicy).toBeUndefined()
  })

  it('removes a component the form emptied', () => {
    const values = runtimeToFormValues(stored)
    values.spec.engineConfig.leader = undefined
    values.spec.engineConfig.worker = undefined
    values.spec.engineConfig.volumes = []
    const runtime = buildRuntime(values, { mode: 'edit', initialData: stored })
    expect(runtime.spec.engineConfig).not.toHaveProperty('leader')
    expect(runtime.spec.engineConfig).not.toHaveProperty('worker')
    expect(runtime.spec.engineConfig).not.toHaveProperty('volumes')
    expect(runtime.spec.decoderConfig).toBeUndefined()
  })
})
