import { describe, it, expect } from 'vitest'
import { isCapabilityAvailable } from './useCapabilities'
import type { Capabilities } from '../api/capabilities'

const caps: Capabilities = {
  omeInstalled: true,
  resources: { inferenceservices: true, rolloutpolicies: false },
  features: { rolloutPolicy: false, omenative: true },
  checkedAt: '2026-10-20T00:00:00Z',
}

describe('isCapabilityAvailable', () => {
  it('treats unknown capabilities as available', () => {
    expect(isCapabilityAvailable(undefined, { resource: 'rolloutpolicies' })).toBe(true)
    expect(isCapabilityAvailable(caps, { resource: 'neverheardof' })).toBe(true)
  })

  it('hides resources and features the cluster reports as absent', () => {
    expect(isCapabilityAvailable(caps, { resource: 'inferenceservices' })).toBe(true)
    expect(isCapabilityAvailable(caps, { resource: 'rolloutpolicies' })).toBe(false)
    expect(isCapabilityAvailable(caps, { feature: 'omenative' })).toBe(true)
    expect(isCapabilityAvailable(caps, { feature: 'rolloutPolicy' })).toBe(false)
  })
})
