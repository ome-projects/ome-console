import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { items: [], total: 0 } })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}))

import { apiClient } from './client'
import { replicasApi } from './replicas'

const mocked = apiClient as unknown as Record<string, ReturnType<typeof vi.fn>>

describe('replicasApi', () => {
  beforeEach(() => Object.values(mocked).forEach((fn) => fn.mockClear()))

  it('uses the namespaced replica routes', async () => {
    await replicasApi.list()
    await replicasApi.list('team-a')
    await replicasApi.get('llama-engine', 'team-a')
    expect(mocked.get.mock.calls.map((c) => c[0])).toEqual([
      '/replicas',
      '/namespaces/team-a/replicas',
      '/namespaces/team-a/replicas/llama-engine',
    ])
  })
})
