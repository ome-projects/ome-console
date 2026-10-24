import { describe, it, expect, vi } from 'vitest'
import { renderWithQuery } from '@/test/utils'
import type { UseServerEventsOptions } from '@/lib/hooks/useServerEvents'
import { ServerEventsBridge } from './ServerEventsBridge'

const captured = vi.hoisted(() => ({ options: {} as UseServerEventsOptions }))

vi.mock('@/lib/hooks/useServerEvents', () => ({
  useServerEvents: (options: UseServerEventsOptions) => {
    captured.options = options
  },
}))

describe('ServerEventsBridge', () => {
  it('invalidates every query after a reconnect, but not on the first connection', () => {
    const { queryClient } = renderWithQuery(<ServerEventsBridge />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    captured.options.onConnected?.()
    expect(invalidate).not.toHaveBeenCalled()

    captured.options.onConnected?.()
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith()
  })
})
