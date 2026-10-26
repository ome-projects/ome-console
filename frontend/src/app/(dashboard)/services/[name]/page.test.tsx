import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import ServiceDetailPage from './page'
import type { InferenceService } from '@/lib/types/service'
import type { ServiceReplicasResponse } from '@/lib/api/serviceReplicas'
import type { Capabilities } from '@/lib/api/capabilities'

const fixtures = vi.hoisted(() => {
  const service: InferenceService = {
    apiVersion: 'ome.io/v1beta1',
    kind: 'InferenceService',
    metadata: {
      name: 'llama',
      namespace: 'team-a',
      creationTimestamp: '2026-10-01T00:00:00Z',
      labels: { team: 'a' },
    },
    spec: {
      model: { name: 'llama-3-8b', kind: 'BaseModel' },
      runtime: { name: 'vllm-team', kind: 'ServingRuntime' },
      deploymentMode: 'OMENative',
      engine: { minReplicas: 2 },
    },
    status: {
      url: 'http://llama.team-a.example.com',
      conditions: [
        { type: 'Ready', status: 'False', reason: 'Initializing', message: 'engine not ready' },
        { type: 'RuntimeReady', status: 'True' },
      ],
      components: {
        engine: {
          url: 'http://llama-engine.team-a.svc',
          scaleTargetRef: {
            apiVersion: 'ome.io/v1beta1',
            kind: 'InferenceReplica',
            name: 'llama-engine',
          },
          lifecycle: { replicas: 2, readyReplicas: 1 },
        },
      },
    },
  }
  const replicas: ServiceReplicasResponse = {
    items: [
      {
        replica: {
          apiVersion: 'ome.io/v1beta1',
          kind: 'InferenceReplica',
          metadata: { name: 'llama-engine', namespace: 'team-a' },
          spec: { component: 'engine', replicas: 2 },
          status: { replicas: 2, readyReplicas: 1 },
        },
        encoding: 'ColumnarV2',
        instances: [
          { index: 0, phase: 'Ready', podCount: 1, servingPodCount: 1 },
          { index: 1, phase: 'Creating', podCount: 1, servingPodCount: 0 },
        ],
      },
    ],
    total: 1,
  }
  const capabilities: Capabilities = {
    omeInstalled: true,
    resources: { inferenceservices: true, inferencereplicas: true },
    features: { omenative: true },
    checkedAt: '2026-10-20T00:00:00Z',
  }
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }
  return { service, replicas, capabilities, router }
})

vi.mock('next/navigation', () => ({
  useRouter: () => fixtures.router,
  usePathname: () => '/services/llama',
  useSearchParams: () => new URLSearchParams('namespace=team-a'),
  useParams: () => ({ name: 'llama' }),
}))

vi.mock('@/lib/api/services', () => ({
  servicesApi: {
    get: vi.fn(async () => fixtures.service),
    delete: vi.fn(async () => undefined),
  },
}))

vi.mock('@/lib/api/serviceReplicas', () => ({
  serviceReplicasApi: { list: vi.fn(async () => fixtures.replicas) },
}))

vi.mock('@/lib/api/objectEvents', () => ({
  objectEventsApi: {
    list: vi.fn(async () => ({
      events: [
        {
          type: 'Warning',
          reason: 'Unschedulable',
          message: '0/3 nodes are available',
          count: 4,
          firstTimestamp: '2026-10-02T00:00:00Z',
          lastTimestamp: '2026-10-02T00:10:00Z',
          source: 'inferencereplica-controller',
        },
      ],
      total: 1,
    })),
  },
}))

vi.mock('@/lib/api/capabilities', () => ({
  capabilitiesApi: { get: vi.fn(async () => fixtures.capabilities) },
}))

import { servicesApi } from '@/lib/api/services'
import { serviceReplicasApi } from '@/lib/api/serviceReplicas'
import { capabilitiesApi } from '@/lib/api/capabilities'

describe('ServiceDetailPage', () => {
  beforeEach(() => {
    vi.mocked(servicesApi.get).mockReset().mockResolvedValue(fixtures.service)
    vi.mocked(servicesApi.delete).mockReset().mockResolvedValue(undefined)
    vi.mocked(serviceReplicasApi.list).mockReset().mockResolvedValue(fixtures.replicas)
    vi.mocked(capabilitiesApi.get).mockReset().mockResolvedValue(fixtures.capabilities)
    fixtures.router.push.mockReset()
  })

  it('renders the overview: name, readiness, model and runtime', async () => {
    renderWithQuery(<ServiceDetailPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'llama' })).toBeInTheDocument()
    expect(servicesApi.get).toHaveBeenCalledWith('llama', 'team-a')

    const overview = screen.getByRole('region', { name: 'Overview' })
    const ready = within(overview).getByText('Not ready')
    expect(ready).toHaveAttribute('data-state', 'NotReady')
    expect(ready).toHaveAttribute('title', 'Initializing: engine not ready')
    expect(within(overview).getByText('Initializing: engine not ready')).toBeInTheDocument()
    expect(within(overview).getByRole('link', { name: 'llama-3-8b' })).toHaveAttribute(
      'href',
      '/models/llama-3-8b?namespace=team-a'
    )
    expect(within(overview).getByText('BaseModel')).toBeInTheDocument()
    expect(within(overview).getByRole('link', { name: 'vllm-team' })).toHaveAttribute(
      'href',
      '/runtimes/vllm-team?namespace=team-a'
    )
    expect(within(overview).getByText('ServingRuntime')).toBeInTheDocument()
    expect(within(overview).getByText('OMENative')).toBeInTheDocument()
    expect(within(overview).getByText('RuntimeReady')).toBeInTheDocument()
    expect(
      within(overview).getByRole('link', { name: 'http://llama.team-a.example.com' })
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/services/llama/edit?namespace=team-a'
    )
    expect(screen.getByRole('region', { name: 'Engine component' })).toBeInTheDocument()
  })

  it('renders the decoded instances and the events', async () => {
    renderWithQuery(<ServiceDetailPage />)
    const grid = await screen.findByRole('region', { name: 'Engine instances' })
    await waitFor(() => expect(serviceReplicasApi.list).toHaveBeenCalledWith('team-a', 'llama'))
    expect(grid.querySelectorAll('tbody tr[data-instance]')).toHaveLength(2)
    expect(within(grid).getByText('Creating')).toHaveAttribute('data-state', 'Creating')

    const events = await screen.findByRole('region', { name: 'Events' })
    expect(await within(events).findByText('Unschedulable')).toBeInTheDocument()
    expect(within(events).getByText('0/3 nodes are available')).toBeInTheDocument()
  })

  it('shows the capability empty state instead of fetching instances', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      ...fixtures.capabilities,
      resources: { inferenceservices: true, inferencereplicas: false },
      features: { omenative: false },
    })
    renderWithQuery(<ServiceDetailPage />)
    expect(
      await screen.findByText('OMENative instances is not available on this cluster')
    ).toBeInTheDocument()
    expect(serviceReplicasApi.list).not.toHaveBeenCalled()
  })

  it('deletes the service after confirmation and returns to the list', async () => {
    renderWithQuery(<ServiceDetailPage />)
    await screen.findByRole('heading', { level: 1, name: 'llama' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Delete' })
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(servicesApi.delete).toHaveBeenCalledWith('llama', 'team-a'))
    await waitFor(() => expect(fixtures.router.push).toHaveBeenCalledWith('/services'))
  })

  it('shows an error when the service does not exist', async () => {
    vi.mocked(servicesApi.get).mockRejectedValue({
      status: 404,
      code: 'NOT_FOUND',
      message: 'inferenceservice "llama" not found',
    })
    renderWithQuery(<ServiceDetailPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('inferenceservice "llama" not found')
    expect(screen.getByRole('link', { name: /Back to Services/ })).toHaveAttribute(
      'href',
      '/services'
    )
  })
})
