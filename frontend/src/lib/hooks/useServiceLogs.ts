import { useCallback, useEffect, useState } from 'react'
import { LogLine, LogNotice, LogStreamParams, streamServiceLogs } from '../api/logs'
import { ApiError } from '../types/api'

export interface UseServiceLogsOptions {
  /** Set false to hold the stream closed, e.g. while a panel is collapsed. */
  enabled?: boolean
  /** Oldest lines are dropped beyond this many. */
  maxLines?: number
}

const DEFAULT_MAX_LINES = 5000
/** Lines arrive in bursts; they are appended to state at most this often. */
const FLUSH_INTERVAL_MS = 100

/**
 * Streams the logs described by `params` and keeps the last `maxLines` lines. The stream
 * restarts whenever the parameters change, and `restart()` reopens it after it ended.
 */
export function useServiceLogs(
  params: LogStreamParams | null,
  options: UseServiceLogsOptions = {}
) {
  const { enabled = true, maxLines = DEFAULT_MAX_LINES } = options
  const [lines, setLines] = useState<LogLine[]>([])
  const [notices, setNotices] = useState<LogNotice[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [generation, setGeneration] = useState(0)

  // The effect keys on the serialized params so a new object with the same values does not
  // reopen the stream.
  const key = params ? JSON.stringify(params) : null

  useEffect(() => {
    // An aborted stream does not clear isStreaming itself, so a closed one must clear it here.
    if (!key || !enabled) {
      setIsStreaming(false)
      return
    }
    const streamParams = JSON.parse(key) as LogStreamParams
    const controller = new AbortController()
    const pending: LogLine[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0)
      setLines((prev) => {
        const next = prev.concat(batch)
        return next.length > maxLines ? next.slice(next.length - maxLines) : next
      })
    }

    setLines([])
    setNotices([])
    setError(null)
    setIsStreaming(true)

    streamServiceLogs(streamParams, {
      signal: controller.signal,
      onLine: (line) => {
        pending.push(line)
        if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
      },
      onNotice: (notice) => setNotices((prev) => [...prev, notice]),
    })
      .catch((err: ApiError) => {
        if (!controller.signal.aborted) setError(err)
      })
      .finally(() => {
        if (flushTimer) clearTimeout(flushTimer)
        if (!controller.signal.aborted) {
          flush()
          setIsStreaming(false)
        }
      })

    return () => {
      controller.abort()
      if (flushTimer) clearTimeout(flushTimer)
    }
  }, [key, enabled, generation, maxLines])

  const restart = useCallback(() => setGeneration((g) => g + 1), [])
  const clear = useCallback(() => setLines([]), [])

  return { lines, notices, error, isStreaming, restart, clear }
}
