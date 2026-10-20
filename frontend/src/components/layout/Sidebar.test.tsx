import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import { Sidebar, navigation, visibleNavigation, type NavigationItem } from './Sidebar'
import type { Capabilities } from '@/lib/api/capabilities'

vi.mock('@/lib/api/capabilities', () => ({
  capabilitiesApi: {
    get: vi.fn(async () => ({
      omeInstalled: true,
      resources: { rolloutpolicies: false },
      features: {},
      checkedAt: '',
    })),
  },
}))

const caps: Capabilities = {
  omeInstalled: true,
  resources: { inferenceservices: true, rolloutpolicies: false },
  features: {},
  checkedAt: '',
}

describe('visibleNavigation', () => {
  const items: NavigationItem[] = [
    { name: 'Services', href: '/services', icon: null },
    {
      name: 'Rollout policies',
      href: '/rolloutpolicies',
      icon: null,
      capability: 'rolloutpolicies',
    },
    { name: 'Replicas', href: '/replicas', icon: null, capability: 'inferencereplicas' },
  ]

  it('shows everything while capabilities are unknown', () => {
    expect(visibleNavigation(items, undefined).map((i) => i.name)).toEqual([
      'Services',
      'Rollout policies',
      'Replicas',
    ])
  })

  it('hides entries whose resource the cluster does not serve', () => {
    expect(visibleNavigation(items, caps).map((i) => i.name)).toEqual(['Services', 'Replicas'])
  })
})

describe('Sidebar', () => {
  it('renders the navigation entries', async () => {
    renderWithQuery(<Sidebar />)
    for (const item of navigation) {
      expect(await screen.findByRole('link', { name: new RegExp(item.name) })).toHaveAttribute(
        'href',
        item.href
      )
    }
  })
})
