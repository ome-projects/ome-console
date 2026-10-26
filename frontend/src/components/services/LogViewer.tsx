'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useServiceLogs } from '@/lib/hooks/useServiceLogs'
import type { LogLine, LogStreamParams } from '@/lib/api/logs'
import { componentLabel, downloadFile } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'

/** Where to point the viewer when something on the page opens it. */
export interface LogTarget {
  component?: string
  instance?: number
}

/** A request to open the viewer; a new `nonce` re-applies the same target. */
export type LogRequest = LogTarget & { nonce: number }

export const TAIL_OPTIONS = [100, 500, 2000] as const
export type TailLines = (typeof TAIL_OPTIONS)[number]

interface LogViewerProps {
  namespace: string
  name: string
  /** Component names from `status.components`, in display order. */
  components: string[]
  /** Decoded instance indexes per OMENative component, for the instance selector. */
  instancesByComponent?: Record<string, number[]>
  /** Set to open the viewer on a target, e.g. from an instance row. */
  request?: LogRequest | null
  /** Lines kept in the buffer. */
  maxLines?: number
}

const DEFAULT_TAIL: TailLines = 500

/** The file name of a download: `<service>-<component>[-<instance>].log`. */
export function logFilename(name: string, component?: string, instance?: number): string {
  const parts = [name, component || 'all']
  if (instance !== undefined) parts.push(String(instance))
  return `${parts.join('-')}.log`
}

/** Serialises buffered lines as `<timestamp> <pod> <line>` text. */
export function serializeLines(lines: LogLine[]): string {
  return lines.map((line) => [line.ts, line.pod, line.line].filter(Boolean).join(' ')).join('\n')
}

function formatLogTime(ts?: string): string {
  if (!ts) return ''
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleTimeString()
}

const selectClass =
  'rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-muted-foreground'

/**
 * Streams the logs of a service's pods: a component, one of its OMENative instances, a container.
 * Collapsed until opened, so no stream runs unasked; the page opens it through `request`.
 */
export const LogViewer = forwardRef<HTMLElement, LogViewerProps>(function LogViewer(
  { namespace, name, components, instancesByComponent, request, maxLines },
  ref
) {
  const [open, setOpen] = useState(false)
  const [component, setComponent] = useState('')
  const [instance, setInstance] = useState('')
  const [containerInput, setContainerInput] = useState('')
  const [container, setContainer] = useState('')
  const [tailLines, setTailLines] = useState<TailLines>(DEFAULT_TAIL)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const paneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!request) return
    setComponent(request.component ?? '')
    setInstance(request.instance === undefined ? '' : String(request.instance))
    setPaused(false)
    setOpen(true)
  }, [request])

  const instanceOptions = component ? (instancesByComponent?.[component] ?? []) : []
  const instanceIndex = instance === '' ? undefined : Number(instance)
  const params: LogStreamParams | null = open
    ? {
        namespace,
        name,
        component: component || undefined,
        instance: instanceIndex,
        container: container || undefined,
        tailLines,
        follow,
      }
    : null

  const { lines, notices, error, isStreaming, restart, clear } = useServiceLogs(params, {
    enabled: open && !paused,
    maxLines,
  })

  useEffect(() => {
    const pane = paneRef.current
    if (follow && pane) pane.scrollTop = pane.scrollHeight
  }, [lines, follow])

  const selectComponent = (value: string) => {
    setComponent(value)
    setInstance('')
  }

  const commitContainer = () => setContainer(containerInput.trim())

  const handleDownload = () => {
    downloadFile(
      `${serializeLines(lines)}\n`,
      logFilename(name, component, instanceIndex),
      'text/plain'
    )
  }

  const target = [
    component ? componentLabel(component) : 'All components',
    instanceIndex !== undefined ? `instance ${instanceIndex}` : null,
    container ? `container ${container}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Panel
      ref={ref}
      title="Logs"
      description={open ? target : 'Pod logs of the service, as kubectl ome logs reads them'}
      actions={
        open ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="ghost" size="sm" onClick={clear} disabled={lines.length === 0}>
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={lines.length === 0}
            >
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Open log viewer
          </Button>
        )
      }
    >
      {!open ? (
        <p className="text-sm text-muted-foreground">
          Opening the viewer starts a log stream for the selected component and instance.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <label className={labelClass}>
              Component
              <select
                className={selectClass}
                value={component}
                onChange={(event) => selectComponent(event.target.value)}
              >
                <option value="">All</option>
                {components.map((option) => (
                  <option key={option} value={option}>
                    {componentLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Instance
              <select
                className={selectClass}
                value={instance}
                onChange={(event) => setInstance(event.target.value)}
                disabled={instanceOptions.length === 0}
                title={
                  instanceOptions.length === 0
                    ? 'Select an OMENative component to pick an instance'
                    : undefined
                }
              >
                <option value="">All</option>
                {instanceOptions.map((index) => (
                  <option key={index} value={String(index)}>
                    {index}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Container
              <input
                type="text"
                className={`${selectClass} w-40`}
                value={containerInput}
                placeholder="ome-container"
                onChange={(event) => setContainerInput(event.target.value)}
                onBlur={commitContainer}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitContainer()
                }}
              />
            </label>
            <label className={labelClass}>
              Tail lines
              <select
                className={selectClass}
                value={tailLines}
                onChange={(event) => setTailLines(Number(event.target.value) as TailLines)}
              >
                {TAIL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Follow
            </label>
            <span className="ml-auto text-xs text-muted-foreground" role="status">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
              {paused ? ' · paused' : isStreaming ? ' · streaming' : ' · stream ended'}
              {!paused && !isStreaming && (
                <button
                  type="button"
                  onClick={restart}
                  className="ml-2 font-medium text-primary hover:text-primary/80"
                >
                  Restart
                </button>
              )}
            </span>
          </div>

          {notices.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {notices.map((notice, index) => (
                <li key={index}>
                  {notice.pod && <span className="font-mono">{notice.pod}: </span>}
                  {notice.notice}
                </li>
              ))}
            </ul>
          )}

          {error && <ErrorState error={error} compact />}

          <div
            ref={paneRef}
            role="log"
            className="h-96 overflow-auto rounded-lg bg-gray-950 p-3 font-mono text-xs leading-5 text-gray-100"
          >
            {lines.length === 0 ? (
              <p className="text-gray-400">
                {paused
                  ? 'Paused.'
                  : isStreaming
                    ? 'Waiting for log lines...'
                    : 'No lines received.'}
              </p>
            ) : (
              lines.map((line, index) => (
                <div
                  key={index}
                  className={clsx(
                    'flex gap-2 whitespace-pre-wrap break-all',
                    index % 2 && 'bg-white/[0.02]'
                  )}
                >
                  {line.ts && (
                    <span className="shrink-0 text-gray-500">{formatLogTime(line.ts)}</span>
                  )}
                  <span
                    className="max-w-[14rem] shrink-0 truncate text-sky-300"
                    title={`${line.pod}/${line.container}`}
                  >
                    {line.pod}
                  </span>
                  <span>{line.line}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Panel>
  )
})
