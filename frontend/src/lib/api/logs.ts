import { apiClient } from './client'
import { ApiError } from '../types/api'

/** Which pods of a service to read, mirroring `kubectl ome logs`. */
export interface LogStreamParams {
  namespace: string
  name: string
  /** engine, decoder or router; omit for all components. */
  component?: string
  /** OMENative instance index. */
  instance?: number
  /** A revision name (`<svc>-<component>-rev-<hash>`) or its hash. */
  revision?: string
  /** Container name; the backend defaults to `ome-container`. */
  container?: string
  /** Lines from the end of each pod's log to start with (backend default 500). */
  tailLines?: number
  /** Keep streaming new lines; the backend ends the stream after 10 minutes. */
  follow?: boolean
}

/** One log line: `{"pod","container","ts","line"}` from the backend. */
export interface LogLine {
  pod: string
  container: string
  ts?: string
  line: string
}

/** An out-of-band message in the stream: truncation, or a pod whose logs could not be read. */
export interface LogNotice {
  pod?: string
  notice: string
}

export interface LogStreamHandlers {
  onLine: (line: LogLine) => void
  onNotice?: (notice: LogNotice) => void
  /** Aborting the signal ends the stream; the promise then resolves without an error. */
  signal?: AbortSignal
}

/** The backend URL for a log stream, including the query. */
export function serviceLogsUrl(params: LogStreamParams): string {
  const base = apiClient.defaults.baseURL ?? ''
  const query = new URLSearchParams()
  if (params.component) query.set('component', params.component)
  if (params.instance !== undefined) query.set('instance', String(params.instance))
  if (params.revision) query.set('revision', params.revision)
  if (params.container) query.set('container', params.container)
  if (params.tailLines !== undefined) query.set('tailLines', String(params.tailLines))
  if (params.follow) query.set('follow', 'true')
  const path = `${base}/namespaces/${encodeURIComponent(params.namespace)}/services/${encodeURIComponent(params.name)}/logs`
  const search = query.toString()
  return search ? `${path}?${search}` : path
}

/**
 * Reads the newline-delimited JSON log stream of a service and hands each line to the
 * handlers. Resolves when the server ends the stream or the signal aborts; rejects with an
 * `ApiError` for a non-2xx response or a failed connection.
 */
export async function streamServiceLogs(
  params: LogStreamParams,
  { onLine, onNotice, signal }: LogStreamHandlers
): Promise<void> {
  let response: Response
  try {
    response = await fetch(serviceLogsUrl(params), {
      signal,
      headers: { Accept: 'application/x-ndjson' },
    })
  } catch (err) {
    if (signal?.aborted) return
    throw networkError(err)
  }
  if (!response.ok) throw await errorFromResponse(response)
  if (!response.body) {
    throw { status: response.status, code: 'NO_BODY', message: 'The log stream has no body' }
  }

  const dispatch = (raw: string) => {
    if (!raw.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      onNotice?.({ notice: `unreadable line: ${raw}` })
      return
    }
    const record = parsed as Record<string, unknown>
    if (typeof record.notice === 'string') {
      onNotice?.(record as unknown as LogNotice)
    } else if (typeof record.line === 'string') {
      onLine(record as unknown as LogLine)
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        dispatch(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    dispatch(buffer)
  } catch (err) {
    if (signal?.aborted) return
    throw networkError(err)
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let data: { error?: string; code?: string; message?: string; details?: unknown } = {}
  try {
    data = await response.json()
  } catch {
    // a non-JSON error body
  }
  return {
    status: response.status,
    code: data.code || 'ERROR',
    message: data.message || data.error || response.statusText || 'Request failed',
    details: data.details,
  }
}

function networkError(err: unknown): ApiError {
  return {
    status: 0,
    code: 'NETWORK_ERROR',
    message: err instanceof Error ? err.message : 'Network error',
  }
}
