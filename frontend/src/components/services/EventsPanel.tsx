'use client'

import { useMemo } from 'react'
import { useObjectEvents } from '@/lib/hooks/useObjectEvents'
import type { ObjectEvent } from '@/lib/api/objectEvents'
import { formatAge, formatTimestamp } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorState } from '@/components/ui/ErrorState'

/** Events are not pushed over SSE; the panel polls while the page is open. */
export const EVENTS_REFETCH_MS = 10000

interface EventsPanelProps {
  namespace: string
  name: string
}

const headerClass =
  'px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
const cellClass = 'px-4 py-2 text-sm align-top'

function lastSeen(event: ObjectEvent): string {
  return event.lastTimestamp || event.firstTimestamp || ''
}

/** Newest first; events without timestamps sink to the end. */
export function sortEventsNewestFirst(events: ObjectEvent[]): ObjectEvent[] {
  return [...events].sort((a, b) => {
    const left = new Date(lastSeen(a)).getTime() || 0
    const right = new Date(lastSeen(b)).getTime() || 0
    return right - left
  })
}

/** The Kubernetes events recorded for the service, polled every 10 s. */
export function EventsPanel({ namespace, name }: EventsPanelProps) {
  const { data, error, isFetching, refetch } = useObjectEvents(
    { namespace, kind: 'InferenceService', name },
    { refetchInterval: EVENTS_REFETCH_MS }
  )
  const events = useMemo(() => sortEventsNewestFirst(data?.events ?? []), [data?.events])

  return (
    <Panel
      title="Events"
      description={`Kubernetes events for the InferenceService, refreshed every ${EVENTS_REFETCH_MS / 1000} s`}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          loading={isFetching}
          aria-label="Refresh events"
        >
          Refresh
        </Button>
      }
    >
      {error ? (
        <ErrorState error={error} compact />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data ? 'No events recorded for this service.' : 'Loading events...'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className={headerClass}>Type</th>
                <th className={headerClass}>Reason</th>
                <th className={headerClass}>Message</th>
                <th className={headerClass}>Count</th>
                <th className={headerClass}>Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {events.map((event, index) => (
                <tr key={`${event.reason}-${lastSeen(event)}-${index}`}>
                  <td className={cellClass}>
                    <Chip tone={event.type === 'Warning' ? 'warning' : 'muted'}>{event.type}</Chip>
                  </td>
                  <td className={`${cellClass} whitespace-nowrap font-medium`}>{event.reason}</td>
                  <td className={`${cellClass} max-w-xl break-words`}>
                    {event.message}
                    {event.source && (
                      <div className="text-xs text-muted-foreground">{event.source}</div>
                    )}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>{event.count}</td>
                  <td
                    className={`${cellClass} whitespace-nowrap text-muted-foreground`}
                    title={formatTimestamp(lastSeen(event))}
                  >
                    {formatAge(lastSeen(event))} ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
