import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { ok: true } })),
    post: vi.fn(async () => ({ data: { ok: true } })),
    put: vi.fn(async () => ({ data: { ok: true } })),
    patch: vi.fn(async () => ({ data: { ok: true } })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}))

import { apiClient } from './client'
import { createResourceApi } from './createResourceApi'

const mocked = apiClient as unknown as Record<string, ReturnType<typeof vi.fn>>

describe('createResourceApi', () => {
  beforeEach(() => Object.values(mocked).forEach((fn) => fn.mockClear()))

  it('builds namespaced paths and lists across namespaces without one', async () => {
    const api = createResourceApi<{ metadata: { name: string } }>('services', {
      namespaced: true,
    })
    await api.list()
    await api.list('team-a')
    await api.get('llama', 'team a')
    expect(mocked.get.mock.calls.map((c) => c[0])).toEqual([
      '/services',
      '/namespaces/team-a/services',
      '/namespaces/team%20a/services/llama',
    ])
  })

  it('refuses single-object calls on a namespaced resource without a namespace', async () => {
    const api = createResourceApi('services', { namespaced: true })
    await expect(api.get('llama')).rejects.toThrow(/namespace is required/)
    await expect(api.delete('llama')).rejects.toThrow(/namespace is required/)
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it('ignores namespaces for cluster-scoped resources', async () => {
    const api = createResourceApi('models', { namespaced: false })
    await api.get('llama', 'team-a')
    await api.delete('llama')
    expect(mocked.get).toHaveBeenCalledWith('/models/llama')
    expect(mocked.delete).toHaveBeenCalledWith('/models/llama')
  })

  it('takes the create namespace from the body and passes dryRun', async () => {
    const api = createResourceApi<{ metadata: { name: string; namespace?: string } }>('services', {
      namespaced: true,
    })
    const body = { metadata: { name: 'x', namespace: 'team-b' } }
    await api.create(body)
    await api.create(body, 'team-c', { dryRun: true })
    expect(mocked.post.mock.calls[0]).toEqual([
      '/namespaces/team-b/services',
      body,
      { params: undefined },
    ])
    expect(mocked.post.mock.calls[1]).toEqual([
      '/namespaces/team-c/services',
      body,
      { params: { dryRun: 'true' } },
    ])
  })

  it('selects the patch content type from the body shape', async () => {
    const api = createResourceApi('services', { namespaced: true })
    await api.patch('llama', [{ op: 'add', path: '/metadata/labels', value: {} }], 'team-a')
    await api.patch('llama', { metadata: { labels: { a: 'b' } } }, 'team-a')
    expect(mocked.patch.mock.calls[0][2]).toMatchObject({
      headers: { 'Content-Type': 'application/json-patch+json' },
    })
    expect(mocked.patch.mock.calls[1][2]).toMatchObject({
      headers: { 'Content-Type': 'application/merge-patch+json' },
    })
  })
})
