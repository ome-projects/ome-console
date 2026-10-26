import { describe, it, expect, vi, afterEach } from 'vitest'
import { serviceLogsUrl, streamServiceLogs, type LogLine, type LogNotice } from './logs'

/** A Response whose body arrives in the given chunks, like a streamed NDJSON reply. */
function streamedResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
  return new Response(body, { status: 200, ...init })
}

describe('serviceLogsUrl', () => {
  it('builds the logs path with only the parameters that are set', () => {
    expect(serviceLogsUrl({ namespace: 'team a', name: 'llama' })).toMatch(
      /\/api\/v1\/namespaces\/team%20a\/services\/llama\/logs$/
    )
    const url = new URL(
      serviceLogsUrl({
        namespace: 'team-a',
        name: 'llama',
        component: 'engine',
        instance: 3,
        revision: 'llama-engine-rev-a1b2c3d4',
        container: 'ome-container',
        tailLines: 200,
        follow: true,
      })
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      component: 'engine',
      instance: '3',
      revision: 'llama-engine-rev-a1b2c3d4',
      container: 'ome-container',
      tailLines: '200',
      follow: 'true',
    })
    expect(serviceLogsUrl({ namespace: 'a', name: 'b', follow: false })).not.toContain('follow')
  })
})

describe('streamServiceLogs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses lines and notices across chunk boundaries', async () => {
    const line = (pod: string, text: string) =>
      JSON.stringify({ pod, container: 'ome-container', ts: '2026-10-26T12:00:00Z', line: text })
    const payload = `${JSON.stringify({ notice: 'showing the first 20 pods' })}\n${line('p0', 'a')}\n${line('p1', 'b')}\n${line('p1', 'c')}`
    const cut = payload.indexOf('"line":"b"') + 4
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamedResponse([payload.slice(0, cut), payload.slice(cut)]))
    )

    const lines: LogLine[] = []
    const notices: LogNotice[] = []
    await streamServiceLogs(
      { namespace: 'team-a', name: 'llama' },
      { onLine: (l) => lines.push(l), onNotice: (n) => notices.push(n) }
    )

    expect(lines.map((l) => `${l.pod}:${l.line}`)).toEqual(['p0:a', 'p1:b', 'p1:c'])
    expect(notices).toEqual([{ notice: 'showing the first 20 pods' }])
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: { Accept: 'application/x-ndjson' },
    })
  })

  it('rejects with the API error body on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'No pods found for the service',
              code: 'NOT_FOUND',
              message: 'pods "llama" not found',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
      )
    )
    await expect(
      streamServiceLogs({ namespace: 'team-a', name: 'llama' }, { onLine: () => {} })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'pods "llama" not found' })
  })

  it('resolves quietly when the signal aborts', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn((_: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
      })
    )
    const done = streamServiceLogs(
      { namespace: 'team-a', name: 'llama', follow: true },
      { onLine: () => {}, signal: controller.signal }
    )
    controller.abort()
    await expect(done).resolves.toBeUndefined()
  })
})
