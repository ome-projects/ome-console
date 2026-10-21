import { describe, it, expect } from 'vitest'
import { withNamespace, resourceHref, resourceEditHref, resourceKey } from './links'

describe('links', () => {
  it('adds the namespace query only for namespaced objects', () => {
    expect(withNamespace('/services/x')).toBe('/services/x')
    expect(withNamespace('/services/x', 'team a')).toBe('/services/x?namespace=team%20a')
  })

  it('builds detail and edit links', () => {
    const cluster = { metadata: { name: 'llama' } }
    const namespaced = { metadata: { name: 'llama', namespace: 'team-a' } }
    expect(resourceHref('/models', cluster)).toBe('/models/llama')
    expect(resourceHref('/models', namespaced)).toBe('/models/llama?namespace=team-a')
    expect(resourceEditHref('/runtimes', namespaced)).toBe('/runtimes/llama/edit?namespace=team-a')
  })

  it('keys objects uniquely across namespaces', () => {
    expect(resourceKey({ metadata: { name: 'llama' } })).toBe('llama')
    expect(resourceKey({ metadata: { name: 'llama', namespace: 'team-a' } })).toBe('team-a/llama')
  })
})
