import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(async () => ({ data: {} })),
  },
}))

import { apiClient } from './client'
import { runtimesApi } from './runtimes'

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>

describe('runtimesApi.create', () => {
  beforeEach(() => post.mockClear())

  it('picks the endpoint from the kind, not from metadata.namespace', async () => {
    await runtimesApi.create({
      kind: 'ServingRuntime',
      metadata: { name: 'vllm', namespace: 'team a' },
    })
    await runtimesApi.create({
      kind: 'ClusterServingRuntime',
      metadata: { name: 'vllm', namespace: 'team-a' },
    })
    await runtimesApi.create({ metadata: { name: 'vllm' } })
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      '/namespaces/team%20a/runtimes',
      '/runtimes',
      '/runtimes',
    ])
  })

  it('refuses a ServingRuntime without a namespace', async () => {
    await expect(
      runtimesApi.create({ kind: 'ServingRuntime', metadata: { name: 'vllm' } })
    ).rejects.toThrow(/needs metadata.namespace/)
    expect(post).not.toHaveBeenCalled()
  })
})
