import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(async () => ({ data: { events: [], total: 0 } })) },
}))

import { apiClient } from './client'
import { objectEventsApi } from './objectEvents'

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>

describe('objectEventsApi', () => {
  beforeEach(() => mockedGet.mockClear())

  it('asks for the events of one object in its namespace', async () => {
    await objectEventsApi.list({ namespace: 'team a', kind: 'InferenceService', name: 'llama' })
    expect(mockedGet).toHaveBeenCalledWith('/namespaces/team%20a/events', {
      params: { kind: 'InferenceService', name: 'llama' },
    })
  })
})
