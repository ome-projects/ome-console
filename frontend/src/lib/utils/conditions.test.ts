import { describe, it, expect } from 'vitest'
import { conditionReason, conditionState, findCondition, readyState } from './conditions'
import type { Condition } from '../types/common'

describe('readyState', () => {
  it('maps the Ready condition', () => {
    expect(readyState([{ type: 'Ready', status: 'True' }])).toBe('Ready')
    expect(readyState([{ type: 'Ready', status: 'False', reason: 'Initializing' }])).toBe(
      'NotReady'
    )
    expect(readyState([{ type: 'Ready', status: 'Unknown' }])).toBe('Unknown')
  })

  it('ignores other conditions and handles a missing status', () => {
    expect(readyState([{ type: 'EngineReady', status: 'True' }])).toBe('Unknown')
    expect(readyState([])).toBe('Unknown')
    expect(readyState(undefined)).toBe('Unknown')
  })
})

describe('findCondition', () => {
  const conditions: Condition[] = [
    { type: 'Ready', status: 'False', reason: 'Initializing' },
    { type: 'RolloutPlanDrift', status: 'True', reason: 'PolicyChanged', message: 'digest moved' },
  ]

  it('returns the condition of the given type', () => {
    expect(findCondition(conditions, 'RolloutPlanDrift')?.reason).toBe('PolicyChanged')
    expect(findCondition(conditions, 'Ready')?.status).toBe('False')
  })

  it('returns undefined when the type is absent or there are no conditions', () => {
    expect(findCondition(conditions, 'InheritanceReady')).toBeUndefined()
    expect(findCondition([], 'Ready')).toBeUndefined()
    expect(findCondition(undefined, 'Ready')).toBeUndefined()
  })
})

describe('conditionState', () => {
  it('reads any condition type as a readiness', () => {
    expect(conditionState([{ type: 'InheritanceReady', status: 'True' }], 'InheritanceReady')).toBe(
      'Ready'
    )
    expect(
      conditionState(
        [{ type: 'MetadataExtracted', status: 'False', reason: 'ConfigMissing' }],
        'MetadataExtracted'
      )
    ).toBe('NotReady')
    expect(conditionState([{ type: 'Ready', status: 'True' }], 'InheritanceReady')).toBe('Unknown')
    expect(conditionState(undefined, 'InheritanceReady')).toBe('Unknown')
  })
})

describe('conditionReason', () => {
  it('joins reason and message', () => {
    expect(
      conditionReason(
        [{ type: 'Ready', status: 'False', reason: 'Initializing', message: 'engine not ready' }],
        'Ready'
      )
    ).toBe('Initializing: engine not ready')
  })

  it('falls back to whichever of reason or message is set', () => {
    expect(conditionReason([{ type: 'Ready', status: 'True', reason: 'Ready' }], 'Ready')).toBe(
      'Ready'
    )
    expect(
      conditionReason([{ type: 'Ready', status: 'False', message: 'waiting for pods' }], 'Ready')
    ).toBe('waiting for pods')
  })

  it('returns undefined without a condition or without text', () => {
    expect(conditionReason([{ type: 'Ready', status: 'True' }], 'Ready')).toBeUndefined()
    expect(conditionReason([{ type: 'Ready', status: 'True' }], 'Other')).toBeUndefined()
    expect(conditionReason(undefined, 'Ready')).toBeUndefined()
  })
})
