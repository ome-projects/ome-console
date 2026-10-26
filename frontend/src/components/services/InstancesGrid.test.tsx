import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { InstancesGrid } from './InstancesGrid'
import type { InferenceReplica, OMENativeInstanceStatus } from '@/lib/types/replica'

const replica: InferenceReplica = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'InferenceReplica',
  metadata: { name: 'llama-engine', namespace: 'team-a' },
  spec: { component: 'engine', replicas: 3 },
  status: {
    replicas: 3,
    readyReplicas: 2,
    servingReplicas: 2,
    availableReplicas: 1,
    updatedReplicas: 1,
    updatedReadyReplicas: 0,
    currentRevision: 'llama-engine-aaa111',
    updateRevision: 'llama-engine-bbb222',
  },
}

const instances: OMENativeInstanceStatus[] = [
  {
    index: 0,
    phase: 'Ready',
    incarnation: 2,
    runningRevision: 'llama-engine-aaa111',
    podCount: 2,
    servingPodCount: 2,
    availablePodCount: 2,
    admitted: true,
    readySince: '2026-10-01T00:00:00Z',
  },
  {
    index: 1,
    phase: 'Updating',
    incarnation: 1,
    runningRevision: 'llama-engine-aaa111',
    targetRevision: 'llama-engine-bbb222',
    podCount: 2,
    servingPodCount: 1,
    availablePodCount: 1,
    admitted: true,
    operation: {
      id: 'op-1',
      type: 'Update',
      step: 'WaitReady',
      startedAt: '2026-10-02T00:00:00Z',
      lastProgressAt: '2026-10-02T00:01:00Z',
      deadline: '2026-10-02T00:10:00Z',
      retryCount: 1,
      waiting: 'QuotaExceeded',
    },
  },
  {
    index: 2,
    phase: 'Failed',
    incarnation: 3,
    runningRevision: 'llama-engine-aaa111',
    podCount: 1,
    servingPodCount: 0,
    availablePodCount: 0,
    admitted: false,
    lastFailure: {
      podName: 'llama-engine-2-0',
      containerName: 'ome-container',
      reason: 'OOMKilled',
      exitCode: 137,
      message: 'container was killed: out of memory',
      time: '2026-10-03T00:00:00Z',
    },
  },
]

/** The instance rows (not the expanded detail rows). */
const rows = () => Array.from(document.querySelectorAll('tbody tr[data-instance]'))

/** The value shown above a counter label. */
function counter(scope: HTMLElement, label: string): string {
  return within(scope).getByText(label, { selector: 'dt' }).previousElementSibling
    ?.textContent as string
}

describe('InstancesGrid', () => {
  it('renders the replica counters and one row per instance', () => {
    render(
      <InstancesGrid
        component="engine"
        replica={replica}
        encoding="ColumnarV2"
        instances={instances}
      />
    )
    const grid = screen.getByRole('region', { name: 'Engine instances' })
    expect(within(grid).getByText('llama-engine')).toBeInTheDocument()
    expect(within(grid).getByText('ColumnarV2')).toBeInTheDocument()
    expect(counter(grid, 'Replicas')).toBe('3')
    expect(counter(grid, 'Ready')).toBe('2')
    expect(counter(grid, 'Serving')).toBe('2')
    expect(counter(grid, 'Available')).toBe('1')
    expect(counter(grid, 'Updated')).toBe('1')
    expect(counter(grid, 'Updated ready')).toBe('0')
    expect(counter(grid, 'Current → update revision')).toBe('aaa111 → bbb222')

    expect(rows()).toHaveLength(3)
    const updating = rows()[1] as HTMLElement
    expect(within(updating).getByText('Updating')).toHaveAttribute('data-state', 'Updating')
    expect(within(updating).getByTitle('llama-engine-aaa111')).toHaveTextContent('aaa111')
    expect(within(updating).getByTitle('llama-engine-bbb222')).toHaveTextContent('bbb222')
    expect(within(updating).getByTitle('pods')).toHaveTextContent('2')
    expect(within(updating).getByTitle('serving')).toHaveTextContent('1')
    expect(within(updating).getByText('Update')).toBeInTheDocument()
    expect(within(updating).getByText('· WaitReady')).toBeInTheDocument()
    expect(within(updating).getByText('waiting: QuotaExceeded')).toBeInTheDocument()
    expect(within(updating).getByText('retry 1')).toBeInTheDocument()

    const failed = rows()[2] as HTMLElement
    expect(within(failed).getByText('Failed')).toHaveAttribute('data-state', 'Failed')
    expect(within(failed).getByText('OOMKilled')).toBeInTheDocument()
    expect(within(failed).getByText('No')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Logs of instance/ })).not.toBeInTheDocument()
  })

  it('filters by phase and counts each phase', () => {
    render(<InstancesGrid component="engine" replica={replica} instances={instances} />)
    const filter = screen.getByRole('group', { name: 'Phase filter' })
    expect(
      within(filter)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['All (3)', 'Ready (1)', 'Updating (1)', 'Failed (1)'])
    expect(within(filter).getByRole('button', { name: 'All (3)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(within(filter).getByRole('button', { name: 'Failed (1)' }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveAttribute('data-instance', '2')
    expect(within(filter).getByRole('button', { name: 'Failed (1)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(within(filter).getByRole('button', { name: 'All (3)' }))
    expect(rows()).toHaveLength(3)
  })

  it('pages through 200 rows at a time', () => {
    const many: OMENativeInstanceStatus[] = Array.from({ length: 450 }, (_, index) => ({
      index,
      phase: index % 2 ? 'Ready' : 'Creating',
    }))
    render(<InstancesGrid component="decoder" replica={replica} instances={many} />)
    expect(rows()).toHaveLength(200)
    expect(rows()[0]).toHaveAttribute('data-instance', '0')
    expect(screen.getByText('Showing 1–200 of 450')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Showing 201–400 of 450')).toBeInTheDocument()
    expect(rows()[0]).toHaveAttribute('data-instance', '200')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Showing 401–450 of 450')).toBeInTheDocument()
    expect(rows()).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    // Filtering resets to the first page of the filtered rows.
    fireEvent.click(screen.getByRole('button', { name: 'Creating (225)' }))
    expect(screen.getByText('Showing 1–200 of 225')).toBeInTheDocument()
    expect(rows()[0]).toHaveAttribute('data-instance', '0')
  })

  it('notes when the backend could not decode the rows', () => {
    render(
      <InstancesGrid
        component="router"
        replica={replica}
        instances={[]}
        decodeError="instanceStatusColumns.members: term 5-3 is not ascending"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The instance rows could not be decoded: instanceStatusColumns.members: term 5-3 is not ascending'
    )
    expect(screen.getByText('No instances reported yet.')).toBeInTheDocument()
  })

  it('expands a row to the last failure and opens the logs of an instance', () => {
    const onOpenLogs = vi.fn()
    render(
      <InstancesGrid
        component="engine"
        replica={replica}
        instances={instances}
        onOpenLogs={onOpenLogs}
      />
    )
    expect(screen.queryByText('llama-engine-2-0')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details of instance 2' }))
    expect(screen.getByText('llama-engine-2-0')).toBeInTheDocument()
    expect(screen.getByText('ome-container')).toBeInTheDocument()
    expect(screen.getByText('137')).toBeInTheDocument()
    expect(screen.getByText('container was killed: out of memory')).toBeInTheDocument()
    expect(screen.getByText('No operation in flight.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide details of instance 2' }))
    expect(screen.queryByText('llama-engine-2-0')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Logs of instance 1' }))
    expect(onOpenLogs).toHaveBeenCalledWith(1)
  })
})
