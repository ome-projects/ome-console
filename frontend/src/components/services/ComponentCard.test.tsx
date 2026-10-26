import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ComponentCard } from './ComponentCard'
import type { ComponentStatusSpec } from '@/lib/types/service'

const engine: ComponentStatusSpec = {
  url: 'http://llama-engine.team-a.svc.cluster.local',
  scaleTargetRef: { apiVersion: 'ome.io/v1beta1', kind: 'InferenceReplica', name: 'llama-engine' },
  rolloutPhase: 'Canarying',
  latestReadyRevision: 'llama-engine-rev-bbb222',
  latestRolledoutRevision: 'llama-engine-rev-aaa111',
  previousRolledoutRevision: 'llama-engine-rev-000999',
  selectedAccelerator: { acceleratorClass: 'h100', reason: 'matched by model size' },
  lifecycle: {
    replicas: 4,
    readyReplicas: 3,
    servingReplicas: 3,
    availableReplicas: 2,
    updatedReplicas: 1,
    updatedReadyReplicas: 1,
    currentRevision: 'llama-engine-aaa111',
    updateRevision: 'llama-engine-bbb222',
    rolloutHold: {
      gate: 'Ratio',
      reason: 'decoder is 2 replicas behind',
      target: 'llama-engine-bbb222',
      since: '2026-10-02T00:00:00Z',
    },
  },
  autoscaler: {
    class: 'KEDA',
    managedBy: 'ome',
    specSource: 'policy',
    policy: { name: 'burst', resolvedDigest: 'ap1:abc', observedGeneration: 2 },
    currentReplicas: 4,
    desiredReplicas: 5,
    lastScaleTime: '2026-10-02T00:00:00Z',
  },
  traffic: [
    { revisionName: 'llama-engine-rev-aaa111', percent: 90, tag: 'stable' },
    { revisionName: 'llama-engine-rev-bbb222', percent: 10, tag: 'canary', latestRevision: true },
  ],
}

/** The value of a labelled field. */
function field(scope: HTMLElement, label: string): string {
  return within(scope).getByText(label, { selector: 'dt' }).nextElementSibling
    ?.textContent as string
}

/** The value shown above a counter label. */
function counter(scope: HTMLElement, label: string): string {
  return within(scope).getByText(label, { selector: 'dt' }).previousElementSibling
    ?.textContent as string
}

describe('ComponentCard', () => {
  it('shows the OMENative chip, the rollout phase, revisions and traffic', () => {
    render(<ComponentCard name="engine" status={engine} />)
    const card = screen.getByRole('region', { name: 'Engine component' })
    expect(within(card).getByText('OMENative')).toBeInTheDocument()
    expect(within(card).getByText('Canarying')).toHaveAttribute('data-state', 'Canarying')
    expect(within(card).getByText('InferenceReplica/llama-engine')).toBeInTheDocument()
    expect(
      within(card).getByText('http://llama-engine.team-a.svc.cluster.local')
    ).toBeInTheDocument()
    expect(within(card).getByText('h100')).toHaveAttribute('title', 'matched by model size')
    expect(within(card).getAllByTitle('llama-engine-rev-bbb222')[0]).toHaveTextContent('bbb222')
    expect(within(card).getByTitle('llama-engine-rev-000999')).toHaveTextContent('000999')
    expect(within(card).getByText('90%')).toBeInTheDocument()
    expect(within(card).getByText('10%')).toBeInTheDocument()
    expect(within(card).getByText('canary')).toBeInTheDocument()
    expect(within(card).getByText('latest')).toBeInTheDocument()
  })

  it('shows lifecycle totals, the revisions and the rollout hold', () => {
    render(<ComponentCard name="engine" status={engine} />)
    const card = screen.getByRole('region', { name: 'Engine component' })
    const lifecycle = within(card).getByRole('region', { name: 'Lifecycle' })
    expect(counter(lifecycle, 'Replicas')).toBe('4')
    expect(counter(lifecycle, 'Ready')).toBe('3')
    expect(counter(lifecycle, 'Serving')).toBe('3')
    expect(counter(lifecycle, 'Available')).toBe('2')
    expect(counter(lifecycle, 'Updated')).toBe('1')
    expect(counter(lifecycle, 'Updated ready')).toBe('1')
    expect(within(lifecycle).getByTitle('llama-engine-aaa111')).toHaveTextContent('aaa111')
    expect(within(lifecycle).getByTitle('llama-engine-bbb222')).toHaveTextContent('bbb222')

    const hold = within(card).getByRole('status')
    expect(hold).toHaveTextContent('Rollout held by the Ratio gate')
    expect(hold).toHaveTextContent('decoder is 2 replicas behind')
    expect(within(hold).getByTitle('llama-engine-bbb222')).toHaveTextContent('bbb222')
  })

  it('shows autoscaler provenance', () => {
    render(<ComponentCard name="engine" status={engine} />)
    const card = screen.getByRole('region', { name: 'Engine component' })
    const autoscaler = within(card).getByRole('region', { name: 'Autoscaler' })
    expect(within(autoscaler).getByText('KEDA')).toBeInTheDocument()
    expect(within(autoscaler).getByText('ome')).toBeInTheDocument()
    expect(within(autoscaler).getByText('policy')).toBeInTheDocument()
    expect(within(autoscaler).getByText('burst')).toBeInTheDocument()
    expect(within(autoscaler).getByText('generation 2')).toBeInTheDocument()
    expect(field(autoscaler, 'Replicas')).toBe('4 current, 5 desired')
    expect(field(autoscaler, 'Policy')).toBe('burstgeneration 2')
  })

  it('renders a RawDeployment component without OMENative details', () => {
    render(
      <ComponentCard
        name="router"
        status={{
          url: 'http://llama-router',
          scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'llama-router' },
        }}
      />
    )
    const card = screen.getByRole('region', { name: 'Router component' })
    expect(within(card).queryByText('OMENative')).not.toBeInTheDocument()
    expect(within(card).queryByRole('region', { name: 'Lifecycle' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('region', { name: 'Autoscaler' })).not.toBeInTheDocument()
    expect(within(card).getByText('Deployment/llama-router')).toBeInTheDocument()
  })
})
