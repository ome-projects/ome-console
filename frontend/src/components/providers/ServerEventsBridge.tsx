'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServerEvents, type ResourceEvent } from '@/lib/hooks/useServerEvents'

/** How long to wait for further events on the same resource before refetching. */
const DEBOUNCE_MS = 250

/**
 * Keeps React Query in sync with the cluster: every Server-Sent Event for a resource key
 * invalidates that key's queries, debounced per key so a burst of updates causes one refetch.
 * Events sent while the stream is down are not replayed, so a reconnect (not the first
 * connection) invalidates every query. Rendered once in the dashboard layout.
 */
export function ServerEventsBridge() {
  const queryClient = useQueryClient()
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const hasConnected = useRef(false)

  const onEvent = useCallback(
    (event: ResourceEvent) => {
      const pending = timers.current.get(event.resource)
      if (pending) clearTimeout(pending)
      timers.current.set(
        event.resource,
        setTimeout(() => {
          timers.current.delete(event.resource)
          void queryClient.invalidateQueries({ queryKey: [event.resource] })
        }, DEBOUNCE_MS)
      )
    },
    [queryClient]
  )

  const onConnected = useCallback(() => {
    if (hasConnected.current) void queryClient.invalidateQueries()
    hasConnected.current = true
  }, [queryClient])

  useServerEvents({ onEvent, onConnected })

  useEffect(() => {
    const active = timers.current
    return () => {
      active.forEach((timer) => clearTimeout(timer))
      active.clear()
    }
  }, [])

  return null
}
