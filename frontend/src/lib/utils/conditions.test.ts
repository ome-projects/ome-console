import { describe, it, expect } from 'vitest'
import { readyState } from './conditions'

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
