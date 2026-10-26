import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RolloutPanel, hasRolloutStatus } from './RolloutPanel'
import type { InferenceServiceStatus } from '@/lib/types/service'

const status: InferenceServiceStatus = {
  conditions: [
    { type: 'Ready', status: 'True' },
    {
      type: 'RolloutPlanDrift',
      status: 'True',
      reason: 'PolicyChanged',
      message: 'the pinned plan differs from canary-10',
    },
  ],
  components: {
    engine: {
      rolloutPhase: 'Canarying',
      canary: {
        currentStep: 1,
        observedTrafficWeight: 10,
        canaryRevisionHash: 'bbb222',
        stableRevisionHash: 'aaa111',
        stepEnteredTime: '2026-10-02T00:05:00Z',
        metricResults: [
          { name: 'error-rate', value: '0.01', operator: '<', threshold: '0.05', passed: true },
          { name: 'p99-latency', passed: false, message: 'no data' },
        ],
      },
    },
    decoder: {},
  },
  rollout: {
    activeRun: {
      runID: 'run-7',
      openedAt: '2026-10-02T00:00:00Z',
      pinnedAt: '2026-10-02T00:00:00Z',
      targetRevisions: [{ component: 'engine', revision: 'bbb222', stableRevision: 'aaa111' }],
      plan: {
        groups: [
          {
            source: 'Policy',
            policyRef: { name: 'canary-10', progression: 'canary' },
            policyGeneration: 3,
            portableDigest: 'rp1:deadbeef',
            group: {
              components: ['engine'],
              canary: {
                steps: [
                  { capacity: '25%', traffic: 10, pause: {} },
                  { capacity: '50%', traffic: 50, pause: { duration: '10m' } },
                  { capacity: '100%', traffic: 100 },
                ],
              },
            },
          },
        ],
      },
    },
    lastRun: {
      outcome: 'RolledBack',
      openedAt: '2026-09-30T00:00:00Z',
      closedAt: '2026-09-30T01:00:00Z',
      groups: [{ source: 'Inline', portableDigest: 'rp1:old' }],
    },
    groups: [
      {
        index: 0,
        source: 'Policy',
        policyRef: { name: 'canary-10', progression: 'canary' },
        observedDigest: 'rp1:feedface',
        shadowedPolicyRef: { name: 'shadowed-policy', wouldPinDigest: 'rp1:shadow' },
      },
    ],
  },
  rolloutCoordination: {
    groups: [
      {
        name: '0',
        phase: 'Surging',
        policy: 'BlueGreen',
        components: ['decoder'],
        message: 'surging 2 pods',
      },
    ],
  },
}

/** The value of a labelled field. */
function field(scope: HTMLElement, label: string): string {
  return within(scope).getByText(label, { selector: 'dt' }).nextElementSibling
    ?.textContent as string
}

describe('hasRolloutStatus', () => {
  it('is false without a run, coordination, canary or drift', () => {
    expect(hasRolloutStatus(undefined)).toBe(false)
    expect(hasRolloutStatus({ conditions: [{ type: 'Ready', status: 'True' }] })).toBe(false)
    expect(hasRolloutStatus({ conditions: [{ type: 'RolloutPlanDrift', status: 'False' }] })).toBe(
      false
    )
    expect(hasRolloutStatus({ rollout: {} })).toBe(true)
    expect(hasRolloutStatus(status)).toBe(true)
  })
})

describe('RolloutPanel', () => {
  it('renders nothing without rollout status', () => {
    const { container } = render(
      <RolloutPanel status={{ conditions: [{ type: 'Ready', status: 'True' }] }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the active run, its pinned plan and the canary progress', () => {
    render(<RolloutPanel status={status} />)
    const run = screen.getByRole('region', { name: 'Active run' })
    expect(within(run).getByText('run-7')).toBeInTheDocument()
    expect(within(run).getByText('Group 1')).toBeInTheDocument()
    expect(within(run).getByText('Canary')).toBeInTheDocument()
    expect(within(run).getByText('source Policy')).toBeInTheDocument()
    expect(within(run).getByText('canary-10')).toHaveAttribute('title', 'RolloutPolicy (canary)')
    expect(within(run).getByText('generation 3')).toBeInTheDocument()
    expect(within(run).getByTitle('rp1:deadbeef')).toBeInTheDocument()
    expect(within(run).getByTitle('bbb222')).toHaveTextContent('bbb222')
    expect(within(run).getByTitle('aaa111')).toHaveTextContent('aaa111')

    const canary = screen.getByRole('region', { name: 'Engine canary' })
    expect(within(canary).getByText('Canarying')).toHaveAttribute('data-state', 'Canarying')
    expect(field(canary, 'Step')).toBe('1 of 3')
    expect(field(canary, 'Traffic weight')).toBe('10%')
    expect(field(canary, 'Canary revision')).toBe('bbb222')
    expect(field(canary, 'Stable revision')).toBe('aaa111')
    const steps = canary.querySelectorAll('tr[data-step-state]')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveAttribute('data-step-state', 'done')
    expect(steps[0]).toHaveTextContent('manual promote')
    expect(steps[1]).toHaveAttribute('data-step-state', 'current')
    expect(steps[1]).toHaveTextContent('after 10m')
    expect(steps[2]).toHaveAttribute('data-step-state', 'pending')
    expect(steps[2]).toHaveTextContent('immediate')

    expect(within(canary).getByText('error-rate')).toBeInTheDocument()
    expect(within(canary).getByText('< 0.05')).toBeInTheDocument()
    expect(within(canary).getByText('passed')).toBeInTheDocument()
    expect(within(canary).getByText('p99-latency')).toBeInTheDocument()
    expect(within(canary).getByText('failed')).toBeInTheDocument()
    expect(within(canary).getByText('no data')).toBeInTheDocument()
  })

  it('warns about rollout plan drift', () => {
    render(<RolloutPanel status={status} />)
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('Rollout plan drift')
    expect(banner).toHaveTextContent('PolicyChanged: the pinned plan differs from canary-10')
  })

  it('does not warn when the plan is in sync', () => {
    render(
      <RolloutPanel
        status={{
          ...status,
          conditions: [{ type: 'RolloutPlanDrift', status: 'False', reason: 'InSync' }],
        }}
      />
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists the last run, the plan resolution and the coordination groups', () => {
    render(<RolloutPanel status={status} />)
    const lastRun = screen.getByRole('region', { name: 'Last run' })
    expect(within(lastRun).getByText('Rolled back')).toHaveAttribute('data-state', 'RolledBack')
    expect(within(lastRun).getByText('1. Inline')).toBeInTheDocument()
    expect(within(lastRun).getByTitle('rp1:old')).toBeInTheDocument()

    const resolution = screen.getByRole('region', { name: 'Plan resolution' })
    expect(within(resolution).getByTitle('rp1:feedface')).toBeInTheDocument()
    expect(within(resolution).getByText('shadowed-policy')).toHaveAttribute('title', 'rp1:shadow')

    const coordination = screen.getByRole('region', { name: 'Coordination groups' })
    expect(within(coordination).getByText('Surging')).toHaveAttribute('data-state', 'Surging')
    expect(within(coordination).getByText('BlueGreen')).toBeInTheDocument()
    expect(within(coordination).getByText('surging 2 pods')).toBeInTheDocument()
  })

  it('takes the canary steps from the spec between runs', () => {
    render(
      <RolloutPanel
        status={{ components: status.components }}
        rolloutSpec={{
          groups: [
            {
              components: ['engine'],
              canary: { steps: [{ capacity: '50%', traffic: 50 }] },
            },
          ],
        }}
      />
    )
    const canary = screen.getByRole('region', { name: 'Engine canary' })
    expect(field(canary, 'Step')).toBe('1 of 1')
    expect(within(canary).getByText('All 1 steps completed.')).toBeInTheDocument()
  })
})
