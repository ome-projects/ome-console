import { describe, it, expect } from 'vitest'
import { belongsToService } from './useReplicas'
import type { InferenceReplica } from '../types/replica'

const replica = (overrides: Partial<InferenceReplica>): InferenceReplica =>
  ({
    apiVersion: 'ome.io/v1beta1',
    kind: 'InferenceReplica',
    metadata: { name: 'x', namespace: 'team-a' },
    spec: {},
    ...overrides,
  }) as InferenceReplica

describe('belongsToService', () => {
  it('matches the service label or the parent reference', () => {
    const labelled = replica({
      metadata: {
        name: 'llama-engine',
        namespace: 'team-a',
        labels: { 'ome.io/inferenceservice': 'llama' },
      },
    })
    const parented = replica({ spec: { parentRef: { name: 'llama' } } as InferenceReplica['spec'] })
    const other = replica({
      metadata: {
        name: 'mistral-engine',
        namespace: 'team-a',
        labels: { 'ome.io/inferenceservice': 'mistral' },
      },
    })
    expect(belongsToService(labelled, 'llama')).toBe(true)
    expect(belongsToService(parented, 'llama')).toBe(true)
    expect(belongsToService(other, 'llama')).toBe(false)
  })
})
