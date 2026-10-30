import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import DashboardPage from './page'

const fixtures = vi.hoisted(() => {
  const service = (name: string, ready?: 'True' | 'False') => ({
    apiVersion: 'ome.io/v1beta1',
    kind: 'InferenceService',
    metadata: { name, namespace: 'team-a' },
    spec: {},
    status: { conditions: ready ? [{ type: 'Ready', status: ready }] : [] },
  })
  return {
    clusterModel: {
      apiVersion: 'ome.io/v1beta1',
      kind: 'ClusterBaseModel',
      metadata: { name: 'llama-3-8b', creationTimestamp: '2026-10-01T00:00:00Z' },
      spec: {},
      status: { state: 'Ready' },
    },
    // Ready, NotReady, and Unknown (no Ready condition yet).
    services: [service('ready', 'True'), service('failing', 'False'), service('starting')],
    // The model list of a selected namespace; a test can replace it to control when it settles.
    namespaceModels: async (): Promise<unknown> => ({ items: [], total: 0 }),
  }
})

vi.mock('@/lib/api/models', () => ({
  modelsApi: {
    list: vi.fn(async (namespace?: string) =>
      namespace ? fixtures.namespaceModels() : { items: [fixtures.clusterModel], total: 1 }
    ),
  },
}))

vi.mock('@/lib/api/runtimes', () => ({
  runtimesApi: { list: vi.fn(async () => ({ items: [], total: 0 })) },
}))

vi.mock('@/lib/api/services', () => ({
  servicesApi: {
    list: vi.fn(async () => ({ items: fixtures.services, total: fixtures.services.length })),
  },
}))

vi.mock('@/lib/api/namespaces', () => ({
  namespacesApi: { list: vi.fn(async () => ({ items: ['default', 'team-a'], total: 2 })) },
}))

/** The value under a stat card's label; `p` keeps headers with the same text out. */
function statValue(label: string): string {
  return screen.getByText(label, { selector: 'p' }).nextElementSibling?.textContent ?? ''
}

describe('DashboardPage', () => {
  beforeEach(() => {
    fixtures.namespaceModels = async () => ({ items: [], total: 0 })
  })

  it('counts only NotReady services as not ready', async () => {
    renderWithQuery(<DashboardPage />)
    await screen.findByText('Not Ready Services', { selector: 'p' })

    expect(statValue('Total Services')).toBe('3')
    expect(statValue('Ready Services')).toBe('1')
    expect(statValue('Not Ready Services')).toBe('1')
  })

  it("keeps the dashboard while a namespace's models load, and shows their error in place", async () => {
    let fail: (error: unknown) => void = () => {}
    fixtures.namespaceModels = () => new Promise((_, reject) => (fail = reject))

    renderWithQuery(<DashboardPage />)
    await screen.findByRole('option', { name: 'Cluster + team-a' })
    expect(statValue('Total Models')).toBe('1')

    fireEvent.change(screen.getByLabelText('Models:'), { target: { value: 'team-a' } })
    await waitFor(() => expect(statValue('Total Models')).toBe('…'))
    expect(statValue('Ready Models')).toBe('…')
    screen.getByLabelText('Models:')

    fail({ status: 404, code: 'CAPABILITY_MISSING', message: 'basemodels: not served' })
    await screen.findByText('This feature is not available on the connected cluster')
    expect(statValue('Total Models')).toBe('1')
    expect(statValue('Not Ready Services')).toBe('1')
    screen.getByLabelText('Models:')
  })
})
