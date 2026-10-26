import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../lib/hooks/useServiceLogs', () => ({
  useServiceLogs: vi.fn(),
}))

vi.mock('../../lib/utils/export', () => ({
  downloadFile: vi.fn(),
  toYaml: vi.fn(),
  exportAsYaml: vi.fn(),
}))

import { useServiceLogs } from '../../lib/hooks/useServiceLogs'
import { downloadFile } from '../../lib/utils/export'
import { LogViewer, logFilename, serializeLines } from './LogViewer'

const mockedHook = vi.mocked(useServiceLogs)

const idle = {
  lines: [],
  notices: [],
  error: null,
  isStreaming: false,
  restart: vi.fn(),
  clear: vi.fn(),
}

const lastParams = () => mockedHook.mock.calls[mockedHook.mock.calls.length - 1][0]
const lastOptions = () => mockedHook.mock.calls[mockedHook.mock.calls.length - 1][1]

function renderViewer(props: Partial<React.ComponentProps<typeof LogViewer>> = {}) {
  return render(
    <LogViewer
      namespace="team-a"
      name="llama"
      components={['engine', 'router']}
      instancesByComponent={{ engine: [0, 1, 2] }}
      {...props}
    />
  )
}

describe('LogViewer', () => {
  beforeEach(() => {
    mockedHook.mockReset()
    mockedHook.mockReturnValue(idle)
    vi.mocked(downloadFile).mockReset()
  })

  it('streams nothing until opened, then the selected component, instance and container', () => {
    renderViewer()
    expect(lastParams()).toBeNull()
    expect(screen.queryByRole('log')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open log viewer' }))
    expect(lastParams()).toEqual({
      namespace: 'team-a',
      name: 'llama',
      component: undefined,
      instance: undefined,
      container: undefined,
      tailLines: 500,
      follow: true,
    })
    expect(lastOptions()).toMatchObject({ enabled: true })
    expect(screen.getByLabelText('Instance')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Component'), { target: { value: 'engine' } })
    expect(screen.getByLabelText('Instance')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Instance'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Tail lines'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('Container'), { target: { value: 'sidecar' } })
    expect(lastParams()).toMatchObject({ component: 'engine', instance: 2, tailLines: 2000 })
    // The container applies when the field is left, not on every keystroke.
    expect(lastParams()?.container).toBeUndefined()
    fireEvent.blur(screen.getByLabelText('Container'))
    expect(lastParams()).toEqual({
      namespace: 'team-a',
      name: 'llama',
      component: 'engine',
      instance: 2,
      container: 'sidecar',
      tailLines: 2000,
      follow: true,
    })

    // Changing the component drops an instance that belongs to the previous one.
    fireEvent.change(screen.getByLabelText('Component'), { target: { value: 'router' } })
    expect(lastParams()).toMatchObject({ component: 'router', instance: undefined })
    expect(screen.getByLabelText('Instance')).toBeDisabled()
  })

  it('toggles follow, pauses and resumes the stream', () => {
    renderViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Open log viewer' }))
    fireEvent.click(screen.getByLabelText('Follow'))
    expect(lastParams()).toMatchObject({ follow: false })

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(lastOptions()).toMatchObject({ enabled: false })
    expect(screen.getByRole('status')).toHaveTextContent('paused')

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(lastOptions()).toMatchObject({ enabled: true })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(lastParams()).toBeNull()
  })

  it('shows notices, the stream error and the buffered lines', () => {
    mockedHook.mockReturnValue({
      ...idle,
      lines: [
        {
          pod: 'llama-engine-0-0',
          container: 'ome-container',
          ts: '2026-10-01T00:00:00Z',
          line: 'hello',
        },
        { pod: 'llama-engine-0-0', container: 'ome-container', line: 'world' },
      ],
      notices: [{ pod: 'llama-engine-1-0', notice: 'logs unavailable: container not started' }],
      error: { status: 404, code: 'NOT_FOUND', message: 'no pods matched the selector' },
    })
    renderViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Open log viewer' }))

    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(screen.getAllByTitle('llama-engine-0-0/ome-container')).toHaveLength(2)
    expect(screen.getByText('logs unavailable: container not started')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('no pods matched the selector')
    expect(screen.getByRole('status')).toHaveTextContent('2 lines')
    expect(screen.getByRole('status')).toHaveTextContent('stream ended')

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(idle.restart).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(idle.clear).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(downloadFile).toHaveBeenCalledWith(
      '2026-10-01T00:00:00Z llama-engine-0-0 hello\nllama-engine-0-0 world\n',
      'llama-all.log',
      'text/plain'
    )
  })

  it('opens on a request from the page with the target pre-filled', () => {
    const { rerender } = renderViewer({ request: null })
    expect(lastParams()).toBeNull()

    rerender(
      <LogViewer
        namespace="team-a"
        name="llama"
        components={['engine', 'router']}
        instancesByComponent={{ engine: [0, 1, 2] }}
        request={{ component: 'engine', instance: 1, nonce: 1 }}
      />
    )
    expect(lastParams()).toMatchObject({ component: 'engine', instance: 1 })
    expect(screen.getByLabelText('Component')).toHaveValue('engine')
    expect(screen.getByLabelText('Instance')).toHaveValue('1')
  })
})

describe('log file helpers', () => {
  it('names the download after the target', () => {
    expect(logFilename('llama')).toBe('llama-all.log')
    expect(logFilename('llama', 'engine')).toBe('llama-engine.log')
    expect(logFilename('llama', 'engine', 3)).toBe('llama-engine-3.log')
  })

  it('serialises lines with their timestamp and pod', () => {
    expect(
      serializeLines([
        { pod: 'p', container: 'c', ts: 't', line: 'a' },
        { pod: 'p', container: 'c', line: 'b' },
      ])
    ).toBe('t p a\np b')
  })
})
