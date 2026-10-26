import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Vitest calls a mock's implementation with no arguments when it resets the mock between
// tests, so the implementations below must tolerate a missing handlers argument.

vi.mock('../api/logs', () => ({
  streamServiceLogs: vi.fn(),
}))

import { streamServiceLogs, type LogStreamHandlers } from '../api/logs'
import { useServiceLogs } from './useServiceLogs'

const mockedStream = vi.mocked(streamServiceLogs)

describe('useServiceLogs', () => {
  beforeEach(() => mockedStream.mockReset())

  it('collects streamed lines and reports when the stream ends', async () => {
    mockedStream.mockImplementation(async (_params, handlers?: LogStreamHandlers) => {
      handlers?.onNotice?.({ notice: 'showing the first 20 pods' })
      handlers?.onLine({ pod: 'p0', container: 'ome-container', line: 'a' })
      handlers?.onLine({ pod: 'p0', container: 'ome-container', line: 'b' })
    })

    const { result } = renderHook(() =>
      useServiceLogs({ namespace: 'team-a', name: 'llama', component: 'engine' })
    )
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(result.current.lines.map((l) => l.line)).toEqual(['a', 'b'])
    expect(result.current.notices).toEqual([{ notice: 'showing the first 20 pods' }])
    expect(result.current.error).toBeNull()
    expect(mockedStream).toHaveBeenCalledTimes(1)
    expect(mockedStream.mock.calls[0][0]).toEqual({
      namespace: 'team-a',
      name: 'llama',
      component: 'engine',
    })
  })

  it('keeps only the last maxLines lines', async () => {
    mockedStream.mockImplementation(async (_params, handlers?: LogStreamHandlers) => {
      for (let i = 0; i < 10; i++) handlers?.onLine({ pod: 'p0', container: 'c', line: String(i) })
    })
    const { result } = renderHook(() =>
      useServiceLogs({ namespace: 'team-a', name: 'llama' }, { maxLines: 3 })
    )
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(result.current.lines.map((l) => l.line)).toEqual(['7', '8', '9'])
  })

  it('surfaces a stream error and restarts on demand', async () => {
    mockedStream.mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'no pods' })
    mockedStream.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useServiceLogs({ namespace: 'team-a', name: 'llama' }))
    await waitFor(() => expect(result.current.error?.code).toBe('NOT_FOUND'))

    act(() => result.current.restart())
    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.error).toBeNull())
  })

  it('does not open a stream without parameters or when disabled', () => {
    renderHook(() => useServiceLogs(null))
    renderHook(() => useServiceLogs({ namespace: 'a', name: 'b' }, { enabled: false }))
    expect(mockedStream).not.toHaveBeenCalled()
  })
})
