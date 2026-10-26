'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  InstancePhases,
  type InferenceReplica,
  type InstancePhase,
  type OMENativeInstanceStatus,
} from '@/lib/types/replica'
import { componentLabel, formatTimestamp } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/components/ui/Icons'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { ConditionsTable } from '@/components/ui/ConditionsTable'
import { Revision } from './Revision'

/** Rows per page; a replica can report thousands of instances. */
export const INSTANCES_PAGE_SIZE = 200

export type InstancePhaseFilter = 'All' | InstancePhase

interface InstancesGridProps {
  /** engine, decoder or router. */
  component: string
  /** The InferenceReplica, with its counters in `status`. */
  replica: InferenceReplica
  /** DenseV1 or ColumnarV2, as the backend found the rows. */
  encoding?: string
  /** The decoded instance rows. */
  instances: OMENativeInstanceStatus[]
  /** Why the backend could not decode the rows, when it could not. */
  decodeError?: string
  /** Opens the log viewer on one instance. */
  onOpenLogs?: (instance: number) => void
  pageSize?: number
}

type ReplicaCounter =
  | 'replicas'
  | 'readyReplicas'
  | 'servingReplicas'
  | 'availableReplicas'
  | 'updatedReplicas'
  | 'updatedReadyReplicas'

const counters: { key: ReplicaCounter; label: string }[] = [
  { key: 'replicas', label: 'Replicas' },
  { key: 'readyReplicas', label: 'Ready' },
  { key: 'servingReplicas', label: 'Serving' },
  { key: 'availableReplicas', label: 'Available' },
  { key: 'updatedReplicas', label: 'Updated' },
  { key: 'updatedReadyReplicas', label: 'Updated ready' },
]

const headerClass =
  'px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap'
const cellClass = 'px-3 py-2 text-sm align-top'

/** Instances per phase, in the phase order of the API. */
export function countByPhase(instances: OMENativeInstanceStatus[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const instance of instances) counts[instance.phase] = (counts[instance.phase] ?? 0) + 1
  return counts
}

function OperationCell({ instance }: { instance: OMENativeInstanceStatus }) {
  const operation = instance.operation
  if (!operation) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap">
        <span className="font-medium">{operation.type}</span>
        <span className="text-muted-foreground"> · {operation.step}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        {operation.waiting && (
          <Chip tone="warning" title="An external condition is holding the operation back">
            waiting: {operation.waiting}
          </Chip>
        )}
        {operation.retryCount !== undefined && operation.retryCount > 0 && (
          <Chip tone="warning">retry {operation.retryCount}</Chip>
        )}
      </span>
    </div>
  )
}

function LastFailureCell({ instance }: { instance: OMENativeInstanceStatus }) {
  const failure = instance.lastFailure
  if (!failure) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex flex-col">
      <span className="font-medium text-destructive">{failure.reason || 'PodFailed'}</span>
      <span className="text-xs text-muted-foreground">{formatTimestamp(failure.time)}</span>
    </div>
  )
}

function InstanceDetails({ instance }: { instance: OMENativeInstanceStatus }) {
  const operation = instance.operation
  const failure = instance.lastFailure
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium">Operation</h4>
          {operation ? (
            <FieldGrid columns={2}>
              <Field label="Type">{operation.type}</Field>
              <Field label="Step">{operation.step}</Field>
              <Field label="ID">
                <span className="font-mono text-xs">{operation.id}</span>
              </Field>
              <Field label="Reason">{operation.reason || '-'}</Field>
              <Field label="Waiting on">{operation.waiting || '-'}</Field>
              <Field label="Retries">{operation.retryCount ?? 0}</Field>
              <Field label="Started">{formatTimestamp(operation.startedAt)}</Field>
              <Field label="Last progress">{formatTimestamp(operation.lastProgressAt)}</Field>
              <Field label="Deadline">
                {operation.deadline ? (
                  formatTimestamp(operation.deadline)
                ) : (
                  <span className="text-muted-foreground">parked</span>
                )}
              </Field>
              <Field label="Target revision">
                <Revision name={operation.targetRevision} />
              </Field>
              {operation.strategy && <Field label="Strategy">{operation.strategy}</Field>}
              {operation.capacityRefusedAt && (
                <Field label="Capacity refused">
                  {formatTimestamp(operation.capacityRefusedAt)}
                </Field>
              )}
              {operation.fromNode && (
                <Field label="From node">
                  <span className="font-mono text-xs">{operation.fromNode}</span>
                </Field>
              )}
              {operation.hintTargetNodes && operation.hintTargetNodes.length > 0 && (
                <Field label="Target nodes">
                  <span className="font-mono text-xs">{operation.hintTargetNodes.join(', ')}</span>
                </Field>
              )}
              {operation.surgeIndex !== undefined && (
                <Field label="Surge index">{operation.surgeIndex}</Field>
              )}
              {operation.requestUUID && (
                <Field label="Migration request">
                  <span className="font-mono text-xs">{operation.requestUUID}</span>
                </Field>
              )}
            </FieldGrid>
          ) : (
            <p className="text-sm text-muted-foreground">No operation in flight.</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">Last failure</h4>
          {failure ? (
            <>
              <FieldGrid columns={2}>
                <Field label="Pod">
                  <span className="break-all font-mono text-xs">{failure.podName}</span>
                </Field>
                <Field label="Container">
                  <span className="font-mono text-xs">{failure.containerName || '-'}</span>
                </Field>
                <Field label="Reason">{failure.reason || '-'}</Field>
                <Field label="Exit code">{failure.exitCode ?? '-'}</Field>
                <Field label="Time">{formatTimestamp(failure.time)}</Field>
              </FieldGrid>
              {failure.message && (
                <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-muted/50 p-3 font-mono text-xs">
                  {failure.message}
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No failure recorded.</p>
          )}
        </div>
      </div>
      <FieldGrid columns={4}>
        <Field label="Active ordinal">{instance.activeOrdinal ?? 0}</Field>
        <Field label="Target revision">
          <Revision name={instance.targetRevision} />
        </Field>
        {instance.nodesOccupied && instance.nodesOccupied.length > 0 && (
          <Field label="Nodes">
            <span className="font-mono text-xs">{instance.nodesOccupied.join(', ')}</span>
          </Field>
        )}
        {instance.announced && instance.announced.length > 0 && (
          <Field label="Announced">
            <span className="font-mono text-xs">{instance.announced.join(', ')}</span>
          </Field>
        )}
      </FieldGrid>
      {instance.conditions && instance.conditions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Conditions</h4>
          <ConditionsTable conditions={instance.conditions} />
        </div>
      )}
    </div>
  )
}

/** The decoded instance rows of one InferenceReplica, with a phase filter and paging. */
export function InstancesGrid({
  component,
  replica,
  encoding,
  instances,
  decodeError,
  onOpenLogs,
  pageSize = INSTANCES_PAGE_SIZE,
}: InstancesGridProps) {
  const [filter, setFilter] = useState<InstancePhaseFilter>('All')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  const counts = useMemo(() => countByPhase(instances), [instances])
  const phases = InstancePhases.filter((phase) => counts[phase] > 0)
  // A phase whose last instance moved on falls back to All rather than an empty table.
  const effectiveFilter: InstancePhaseFilter = filter !== 'All' && !counts[filter] ? 'All' : filter

  const rows = useMemo(() => {
    const sorted = [...instances].sort((a, b) => a.index - b.index)
    return effectiveFilter === 'All'
      ? sorted
      : sorted.filter((instance) => instance.phase === effectiveFilter)
  }, [instances, effectiveFilter])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const status = replica.status

  const selectFilter = (next: InstancePhaseFilter) => {
    setFilter(next)
    setPage(0)
  }

  const toggleExpanded = (index: number) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const columnCount = onOpenLogs ? 11 : 10
  const label = componentLabel(component)

  return (
    <section
      aria-label={`${label} instances`}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="space-y-4 border-b border-border bg-muted/30 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{label} instances</h3>
          <span className="font-mono text-xs text-muted-foreground">{replica.metadata.name}</span>
          {encoding && <Chip title="Instance status encoding">{encoding}</Chip>}
        </div>
        <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {counters.map(({ key, label: counterLabel }) => (
            <div key={key} className="flex flex-col-reverse rounded-lg bg-card px-3 py-2">
              <dd className="text-lg font-semibold leading-tight">{status?.[key] ?? 0}</dd>
              <dt className="text-xs text-muted-foreground">{counterLabel}</dt>
            </div>
          ))}
          <div className="col-span-3 flex flex-col-reverse rounded-lg bg-card px-3 py-2 sm:col-span-2">
            <dd className="text-sm leading-tight">
              <Revision name={status?.currentRevision} />
              {status?.updateRevision && status.updateRevision !== status.currentRevision && (
                <>
                  <span className="text-muted-foreground"> → </span>
                  <Revision name={status.updateRevision} />
                </>
              )}
            </dd>
            <dt className="text-xs text-muted-foreground">
              {status?.updateRevision && status.updateRevision !== status.currentRevision
                ? 'Current → update revision'
                : 'Revision'}
            </dt>
          </div>
        </dl>
      </div>

      {decodeError && (
        <div
          role="alert"
          className="border-b border-warning/30 bg-warning/10 px-6 py-3 text-sm text-warning"
        >
          The instance rows could not be decoded: {decodeError}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2 px-6 py-3"
        role="group"
        aria-label="Phase filter"
      >
        <button
          type="button"
          onClick={() => selectFilter('All')}
          aria-pressed={effectiveFilter === 'All'}
          className={clsx(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            effectiveFilter === 'All'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          All ({instances.length})
        </button>
        {phases.map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => selectFilter(phase)}
            aria-pressed={effectiveFilter === phase}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              effectiveFilter === phase
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {phase} ({counts[phase]})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className={headerClass}>
                <span className="sr-only">Details</span>
              </th>
              <th className={headerClass}>Index</th>
              <th className={headerClass}>Phase</th>
              <th className={headerClass}>Incarnation</th>
              <th className={headerClass}>Revision</th>
              <th className={headerClass} title="total / serving / available">
                Pods
              </th>
              <th className={headerClass}>Admitted</th>
              <th className={headerClass}>Ready since</th>
              <th className={headerClass}>Operation</th>
              <th className={headerClass}>Last failure</th>
              {onOpenLogs && (
                <th className={headerClass}>
                  <span className="sr-only">Logs</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-6 py-10 text-center text-sm text-muted-foreground"
                >
                  {instances.length === 0
                    ? 'No instances reported yet.'
                    : 'No instances in this phase.'}
                </td>
              </tr>
            ) : (
              visible.map((instance) => {
                const isExpanded = expanded.has(instance.index)
                const rolling =
                  instance.targetRevision && instance.targetRevision !== instance.runningRevision
                return (
                  <InstanceRow
                    key={instance.index}
                    instance={instance}
                    expanded={isExpanded}
                    rolling={!!rolling}
                    columnCount={columnCount}
                    onToggle={() => toggleExpanded(instance.index)}
                    onOpenLogs={onOpenLogs}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {rows.length > pageSize && (
        <nav
          aria-label="Instance pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 text-sm"
        >
          <span className="text-muted-foreground">
            Showing {currentPage * pageSize + 1}–
            {Math.min((currentPage + 1) * pageSize, rows.length)} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {currentPage + 1} of {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </section>
  )
}

interface InstanceRowProps {
  instance: OMENativeInstanceStatus
  expanded: boolean
  rolling: boolean
  columnCount: number
  onToggle: () => void
  onOpenLogs?: (instance: number) => void
}

function InstanceRow({
  instance,
  expanded,
  rolling,
  columnCount,
  onToggle,
  onOpenLogs,
}: InstanceRowProps) {
  return (
    <>
      <tr className="transition-colors hover:bg-muted/30" data-instance={instance.index}>
        <td className={cellClass}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} details of instance ${instance.index}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icons.chevronRight
              size="sm"
              className={clsx('transition-transform', expanded && 'rotate-90')}
            />
          </button>
        </td>
        <td className={`${cellClass} font-mono font-medium`}>{instance.index}</td>
        <td className={cellClass}>
          <StatusBadge state={instance.phase} size="sm" />
        </td>
        <td className={`${cellClass} text-muted-foreground`}>{instance.incarnation ?? 0}</td>
        <td className={`${cellClass} whitespace-nowrap`}>
          <Revision name={instance.runningRevision} />
          {rolling && (
            <>
              <span className="text-muted-foreground"> → </span>
              <Revision name={instance.targetRevision} />
            </>
          )}
        </td>
        <td className={`${cellClass} whitespace-nowrap font-mono text-xs`}>
          <span title="pods">{instance.podCount ?? 0}</span>
          <span className="text-muted-foreground"> / </span>
          <span title="serving">{instance.servingPodCount ?? 0}</span>
          <span className="text-muted-foreground"> / </span>
          <span title="available">{instance.availablePodCount ?? 0}</span>
        </td>
        <td className={`${cellClass} text-muted-foreground`}>
          {instance.admitted === undefined ? '-' : instance.admitted ? 'Yes' : 'No'}
        </td>
        <td className={`${cellClass} whitespace-nowrap text-muted-foreground`}>
          {formatTimestamp(instance.readySince)}
        </td>
        <td className={cellClass}>
          <OperationCell instance={instance} />
        </td>
        <td className={cellClass}>
          <LastFailureCell instance={instance} />
        </td>
        {onOpenLogs && (
          <td className={cellClass}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenLogs(instance.index)}
              aria-label={`Logs of instance ${instance.index}`}
            >
              Logs
            </Button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={columnCount} className="px-6 py-4">
            <InstanceDetails instance={instance} />
          </td>
        </tr>
      )}
    </>
  )
}
