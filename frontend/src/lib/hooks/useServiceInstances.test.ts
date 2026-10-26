import { describe, it, expect } from 'vitest'
import { isConverging, serviceInstancesQueryKey } from './useServiceInstances'
import type { DecodedServiceReplica } from '../api/serviceReplicas'
import type { InferenceReplica, MigrationStatus } from '../types/replica'

const replica = (status: InferenceReplica['status'] = {}): InferenceReplica => ({
  apiVersion: 'ome.io/v1beta1',
  kind: 'InferenceReplica',
  metadata: { name: 'llama-engine', namespace: 'team-a' },
  spec: { component: 'engine' },
  status,
})

const migration = (phase: MigrationStatus['phase']): MigrationStatus => ({
  requestUUID: `m-${phase}`,
  phase,
  sourceInstance: 0,
  trigger: 'Manual',
  startedAt: '2026-10-01T00:00:00Z',
  deadline: '2026-10-01T01:00:00Z',
})

describe('isConverging', () => {
  it('is false when every instance is Ready and no migration is in flight', () => {
    const items: DecodedServiceReplica[] = [
      {
        replica: replica({
          migrations: [migration('Completed'), migration('Failed'), migration('Relocated')],
        }),
        encoding: 'ColumnarV2',
        instances: [
          { index: 0, phase: 'Ready' },
          { index: 1, phase: 'Ready' },
        ],
      },
    ]
    expect(isConverging(items)).toBe(false)
    expect(isConverging([])).toBe(false)
  })

  it('is true while an instance is not Ready', () => {
    const items: DecodedServiceReplica[] = [
      {
        replica: replica(),
        encoding: 'DenseV1',
        instances: [
          { index: 0, phase: 'Ready' },
          { index: 1, phase: 'Updating' },
        ],
      },
    ]
    expect(isConverging(items)).toBe(true)
  })

  it('is true while a migration is in flight', () => {
    const items: DecodedServiceReplica[] = [
      {
        replica: replica({ migrations: [migration('Draining')] }),
        encoding: 'ColumnarV2',
        instances: [{ index: 0, phase: 'Ready' }],
      },
    ]
    expect(isConverging(items)).toBe(true)
  })
})

describe('serviceInstancesQueryKey', () => {
  it('shares the replicas prefix so replica events refresh it', () => {
    expect(serviceInstancesQueryKey('team-a', 'llama')).toEqual([
      'replicas',
      'team-a',
      'service',
      'llama',
      'instances',
    ])
  })
})
