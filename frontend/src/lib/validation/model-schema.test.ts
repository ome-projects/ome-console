import { describe, it, expect } from 'vitest'
import { DownloadPolicies, ModelDistributions } from '@/lib/types/model'
import { baseModelSchema, baseModelSpecSchema, clusterBaseModelSchema } from './model-schema'

const spec = {
  vendor: 'meta',
  modelFormat: { name: 'safetensors', version: '' },
  modelFramework: { name: '', version: '' },
  storage: { storageUri: 'hf://meta-llama/Llama-3.2-1B-Instruct', path: '/mnt/data/models/llama' },
}

const clusterModel = (overrides: Record<string, unknown> = {}) => ({
  metadata: { name: 'llama-3-2-1b' },
  spec: { ...spec, ...overrides },
})

describe('model schema', () => {
  it('accepts a valid spec, fills in the kind and drops blank optional fields', () => {
    const result = clusterBaseModelSchema.safeParse(clusterModel({ distribution: '' }))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.apiVersion).toBe('ome.io/v1beta1')
    expect(result.data.kind).toBe('ClusterBaseModel')
    expect(result.data.spec.distribution).toBeUndefined()
    expect(result.data.spec.modelFramework).toBeUndefined()
    expect(result.data.spec.modelFormat).toEqual({ name: 'safetensors' })
    expect(result.data.spec.storage).toEqual(spec.storage)
  })

  it('requires storage with a storageUri', () => {
    expect(baseModelSpecSchema.safeParse({ vendor: 'meta' }).success).toBe(false)
    expect(baseModelSpecSchema.safeParse({ storage: {} }).success).toBe(false)
    expect(baseModelSpecSchema.safeParse({ storage: { storageUri: '' } }).success).toBe(false)
    expect(
      baseModelSpecSchema.safeParse({ storage: { storageUri: 'pvc://pvc/sub' } }).success
    ).toBe(true)
  })

  it('keeps modelFormat optional in the API shape and required in the create form', () => {
    expect(baseModelSpecSchema.safeParse({ storage: spec.storage }).success).toBe(true)
    const result = clusterBaseModelSchema.safeParse(clusterModel({ modelFormat: { name: '' } }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('spec.modelFormat.name')
  })

  it('restricts distribution and downloadPolicy to the generated values', () => {
    for (const distribution of ModelDistributions) {
      const result = clusterBaseModelSchema.safeParse(clusterModel({ distribution }))
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.spec.distribution).toBe(distribution)
    }
    for (const downloadPolicy of DownloadPolicies) {
      const result = clusterBaseModelSchema.safeParse(
        clusterModel({ storage: { ...spec.storage, downloadPolicy } })
      )
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.spec.storage.downloadPolicy).toBe(downloadPolicy)
    }
    expect(
      clusterBaseModelSchema.safeParse(clusterModel({ distribution: 'Replicated' })).success
    ).toBe(false)
    expect(
      clusterBaseModelSchema.safeParse(
        clusterModel({ storage: { ...spec.storage, downloadPolicy: 'Never' } })
      ).success
    ).toBe(false)
  })

  it('keeps unknown keys so an edit does not strip them', () => {
    const result = baseModelSpecSchema.safeParse({
      ...spec,
      modelCapabilities: ['TEXT_GENERATION'],
      storage: { ...spec.storage, nodeSelector: { gpu: 'h100' } },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.modelCapabilities).toEqual(['TEXT_GENERATION'])
    expect(result.data.storage.nodeSelector).toEqual({ gpu: 'h100' })
  })

  it('requires a path only for models the agent downloads to the nodes', () => {
    const noPath = (storageUri: string) =>
      baseModelSchema.safeParse({
        metadata: { name: 'm', namespace: 'team-a' },
        spec: { ...spec, storage: { storageUri, path: '' } },
      })
    expect(noPath('hf://org/repo').success).toBe(false)
    expect(noPath('modelpack://ghcr.io/org/model:v1').success).toBe(false)
    expect(noPath('pvc://pvc/sub').success).toBe(true)
    expect(noPath('vendor://acme/models/m').success).toBe(true)
  })

  it('applies the pvc:// rules of the kind', () => {
    const cluster = (storageUri: string) =>
      clusterBaseModelSchema.safeParse(clusterModel({ storage: { storageUri } }))
    const namespaced = (storageUri: string) =>
      baseModelSchema.safeParse({
        metadata: { name: 'm', namespace: 'team-a' },
        spec: { ...spec, storage: { storageUri } },
      })
    expect(cluster('pvc://llama-demo:model-storage/llama').success).toBe(true)
    expect(cluster('pvc://model-storage/llama').success).toBe(false)
    expect(namespaced('pvc://model-storage/llama').success).toBe(true)
    expect(namespaced('pvc://llama-demo:model-storage/llama').success).toBe(false)

    const sharded = clusterBaseModelSchema.safeParse(
      clusterModel({ distribution: 'Sharded', storage: { storageUri: 'pvc://ns:pvc/sub' } })
    )
    expect(sharded.success).toBe(false)
    expect(sharded.error?.issues.map((i) => i.path.join('.'))).toContain('spec.distribution')
  })
})
