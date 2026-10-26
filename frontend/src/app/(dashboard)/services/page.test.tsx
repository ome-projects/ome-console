import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import ServicesPage from './page'
import type { InferenceService } from '@/lib/types/service'

const fixtures = vi.hoisted(() => {
  const services: InferenceService[] = [
    {
      apiVersion: 'ome.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: 'llama', namespace: 'team-a', creationTimestamp: '2026-10-01T00:00:00Z' },
      spec: {
        model: { name: 'llama-3-8b', kind: 'BaseModel' },
        runtime: { name: 'vllm-team', kind: 'ServingRuntime' },
        deploymentMode: 'OMENative',
      },
      status: {
        url: 'http://llama.team-a.example.com',
        conditions: [
          { type: 'Ready', status: 'True' },
          {
            type: 'RolloutPlanDrift',
            status: 'True',
            reason: 'PolicyChanged',
            message: 'the pinned plan differs from canary-10',
          },
        ],
        components: { engine: { rolloutPhase: 'Canarying' }, router: { rolloutPhase: 'Stable' } },
        placement: { phase: 'Placed', cluster: 'east' },
        rollout: {
          activeRun: {
            runID: 'run-1',
            openedAt: '2026-10-02T00:00:00Z',
            pinnedAt: '2026-10-02T00:00:00Z',
            plan: {
              groups: [
                {
                  source: 'Policy',
                  policyRef: { name: 'canary-10', progression: 'canary' },
                  group: { components: ['engine'] },
                },
              ],
            },
          },
        },
      },
    },
    {
      apiVersion: 'ome.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: 'mistral', namespace: 'default' },
      spec: { model: { name: 'mistral-7b' } },
      status: {
        conditions: [
          { type: 'Ready', status: 'False', reason: 'Initializing', message: 'engine not ready' },
        ],
        components: { engine: { rolloutPhase: 'Stable' } },
      },
    },
  ]
  return { services }
})

vi.mock('@/lib/api/services', () => ({
  servicesApi: {
    list: vi.fn(async () => ({ items: fixtures.services, total: fixtures.services.length })),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/api/namespaces', () => ({
  namespacesApi: { list: vi.fn(async () => ({ items: ['default', 'team-a'], total: 2 })) },
}))

/** The value under a stat card's label; `p` keeps badges and headers with the same text out. */
function statValue(label: string): string {
  return screen.getByText(label, { selector: 'p' }).nextElementSibling?.textContent ?? ''
}

function row(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement
}

describe('ServicesPage', () => {
  it('renders the InferenceService printer columns', async () => {
    renderWithQuery(<ServicesPage />)
    await screen.findByRole('link', { name: 'llama' })

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      '',
      'Name',
      'Namespace',
      'URL',
      'Ready',
      'BaseModel',
      'Runtime',
      'Mode',
      'Created',
    ])

    const llama = row('llama')
    expect(within(llama).getByTitle('http://llama.team-a.example.com')).toHaveTextContent(
      'http://llama.team-a.example.com'
    )
    expect(within(llama).getByText('Ready')).toHaveAttribute('data-state', 'Ready')
    expect(within(llama).getByText('llama-3-8b')).toBeInTheDocument()
    expect(within(llama).getByText('BaseModel')).toBeInTheDocument()
    expect(within(llama).getByText('vllm-team')).toBeInTheDocument()
    expect(within(llama).getByText('ServingRuntime')).toBeInTheDocument()
    expect(within(llama).getByText('OMENative')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'llama' })).toHaveAttribute(
      'href',
      '/services/llama?namespace=team-a'
    )
  })

  it('labels an unset runtime "auto", defaults the mode and explains readiness', async () => {
    renderWithQuery(<ServicesPage />)
    await screen.findByRole('link', { name: 'mistral' })
    const mistral = row('mistral')

    expect(within(mistral).getByText('auto')).toBeInTheDocument()
    expect(within(mistral).getByText('RawDeployment')).toBeInTheDocument()
    expect(within(mistral).queryByText('BaseModel')).not.toBeInTheDocument()
    const ready = within(mistral).getByText('Not ready')
    expect(ready).toHaveAttribute('data-state', 'NotReady')
    expect(ready).toHaveAttribute('title', 'Initializing: engine not ready')
  })

  it('counts ready, not ready and rolling services', async () => {
    renderWithQuery(<ServicesPage />)
    await screen.findByRole('link', { name: 'llama' })

    expect(statValue('Total Services')).toBe('2')
    expect(statValue('Ready')).toBe('1')
    expect(statValue('Not ready')).toBe('1')
    expect(statValue('Rolling')).toBe('1')
  })

  it('adds placement, plan source and plan drift in wide mode', async () => {
    renderWithQuery(<ServicesPage />)
    await screen.findByRole('link', { name: 'llama' })

    expect(screen.queryByRole('columnheader', { name: 'Placement' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wide' }))

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers.slice(8, 11)).toEqual(['Placement', 'Plan source', 'Plan drift'])

    const llama = row('llama')
    expect(within(llama).getByText('Placed')).toHaveAttribute('data-state', 'Placed')
    expect(within(llama).getByText('Policy (canary-10)')).toBeInTheDocument()
    expect(within(llama).getByText('Drifted')).toHaveAttribute(
      'title',
      'PolicyChanged: the pinned plan differs from canary-10'
    )

    const mistral = row('mistral')
    const cells = within(mistral)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(cells.slice(8, 11)).toEqual(['-', '-', '-'])
  })
})
