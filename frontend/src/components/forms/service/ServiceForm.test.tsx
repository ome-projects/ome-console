import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// CodeMirror needs a real DOM layout; a textarea stands in for it here.
vi.mock('@/components/editor/YamlEditor', () => ({
  YamlEditor: ({
    value,
    onChange,
    'aria-label': label,
  }: {
    value: string
    onChange?: (value: string) => void
    'aria-label'?: string
  }) => (
    <textarea
      aria-label={label ?? 'YAML editor'}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

import { apiClient } from '@/lib/api/client'
import { ServiceForm } from './ServiceForm'

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>

const clusterModel = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'ClusterBaseModel',
  metadata: { name: 'llama-3' },
  spec: {
    modelFormat: { name: 'safetensors' },
    modelFramework: { name: 'transformers' },
    modelParameterSize: '8B',
  },
}

const explainItems = [
  {
    runtime: { name: 'vllm', kind: 'ClusterServingRuntime' },
    compatible: true,
    autoSelect: true,
    score: 15,
    reasons: ['format safetensors'],
  },
  {
    runtime: { name: 'tgi', kind: 'ClusterServingRuntime' },
    compatible: false,
    autoSelect: false,
    score: 0,
    reasons: [],
    exclusion: 'format gguf not supported',
  },
]

function mockReads() {
  get.mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
    switch (url) {
      case '/namespaces':
        return { data: { items: ['default', 'team-a'], total: 2 } }
      case '/models':
        return {
          data: config?.params?.namespace
            ? { items: [], total: 0 }
            : { items: [clusterModel], total: 1 },
        }
      case '/runtimes':
      case '/accelerators':
        return { data: { items: [], total: 0 } }
      case '/capabilities':
        return { data: { omeInstalled: true, resources: {}, features: {}, checkedAt: '' } }
      default:
        if (url.endsWith('/autoscalerpolicies')) return { data: { items: [], total: 0 } }
        throw new Error(`unexpected GET ${url}`)
    }
  })
}

const serviceCalls = () =>
  post.mock.calls.filter((call) => call[0] === '/namespaces/default/services')

async function fillMinimalForm() {
  fireEvent.change(screen.getByPlaceholderText('my-inference-service'), {
    target: { value: 'llama' },
  })
  await screen.findByRole('option', { name: /llama-3/ })
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'llama-3' } })
}

const expectedService = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'InferenceService',
  metadata: { name: 'llama', namespace: 'default' },
  spec: { model: { name: 'llama-3' }, engine: {} },
}

describe('ServiceForm', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    mockReads()
    post.mockImplementation(async (url: string, body: unknown) =>
      url === '/runtimes/explain' ? { data: { items: explainItems } } : { data: body }
    )
  })

  it('dry-runs the create before creating for real', async () => {
    const onSuccess = vi.fn()
    renderWithQuery(<ServiceForm mode="create" onSuccess={onSuccess} />)
    await fillMinimalForm()

    fireEvent.click(screen.getByRole('button', { name: /Deploy Service/ }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    const calls = serviceCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0][2]).toEqual({ params: { dryRun: 'true' } })
    expect(calls[1][2]).toEqual({ params: undefined })
    expect(calls[0][1]).toEqual(expectedService)
    expect(calls[1][1]).toEqual(expectedService)
    expect(onSuccess).toHaveBeenCalledWith(expectedService)
  })

  it('shows the dry run causes and does not create when the API server rejects it', async () => {
    const onSuccess = vi.fn()
    post.mockImplementation(
      async (url: string, body: unknown, config?: { params?: Record<string, string> }) => {
        if (url === '/runtimes/explain') return { data: { items: explainItems } }
        if (config?.params?.dryRun === 'true') {
          throw {
            status: 422,
            code: 'INVALID',
            message: 'InferenceService "llama" is invalid',
            details: [
              {
                field: 'spec.engine.maxReplicas',
                reason: 'FieldValueInvalid',
                message: 'must be greater than or equal to 1',
              },
            ],
          }
        }
        return { data: body }
      }
    )
    renderWithQuery(<ServiceForm mode="create" onSuccess={onSuccess} />)
    await fillMinimalForm()

    fireEvent.click(screen.getByRole('button', { name: /Deploy Service/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('InferenceService "llama" is invalid')
    expect(alert).toHaveTextContent('spec.engine.maxReplicas')
    expect(alert).toHaveTextContent('must be greater than or equal to 1')
    expect(serviceCalls()).toHaveLength(1)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('applies the webhook rules before sending anything', async () => {
    renderWithQuery(<ServiceForm mode="create" onSuccess={vi.fn()} />)
    await fillMinimalForm()
    fireEvent.change(screen.getByLabelText('Min replicas'), { target: { value: '0' } })

    fireEvent.click(screen.getByRole('button', { name: /Deploy Service/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'spec.engine.minReplicas: engine: minReplicas 0 (scale to zero) requires autoscaler.class KEDA'
    )
    expect(serviceCalls()).toHaveLength(0)
  })

  it('ranks runtimes through the explain endpoint and pins the chosen one', async () => {
    renderWithQuery(<ServiceForm mode="create" onSuccess={vi.fn()} />)
    await fillMinimalForm()
    fireEvent.click(screen.getByLabelText(/Choose a runtime/))

    const vllm = await screen.findByRole('radio', { name: /^vllm/ })
    expect(screen.getByRole('radio', { name: /^tgi/ })).toBeDisabled()
    expect(screen.getByText('format gguf not supported')).toBeInTheDocument()
    fireEvent.click(vllm)
    fireEvent.click(screen.getByRole('button', { name: /Deploy Service/ }))

    await waitFor(() => expect(serviceCalls()).toHaveLength(2))
    expect(serviceCalls()[0][1]).toMatchObject({ spec: { runtime: { name: 'vllm' } } })
    expect(post.mock.calls.find((call) => call[0] === '/runtimes/explain')?.[1]).toEqual({
      namespace: 'default',
      model: { name: 'llama-3', kind: 'ClusterBaseModel' },
      acceleratorClasses: undefined,
      deploymentMode: undefined,
    })
  })

  it('submits the edited YAML instead of the form', async () => {
    renderWithQuery(<ServiceForm mode="create" onSuccess={vi.fn()} />)
    await fillMinimalForm()

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    const editor = (await screen.findByLabelText('InferenceService YAML')) as HTMLTextAreaElement
    expect(editor.value).toContain('name: llama-3')
    fireEvent.change(editor, {
      target: {
        value: [
          'apiVersion: ome.io/v1beta1',
          'kind: InferenceService',
          'metadata:',
          '  name: from-yaml',
          '  namespace: default',
          'spec:',
          '  model:',
          '    name: llama-3',
          '  engine: {}',
          '',
        ].join('\n'),
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Form' }))
    expect(screen.getByText(/The YAML was edited/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Deploy Service/ }))

    await waitFor(() => expect(serviceCalls()).toHaveLength(2))
    expect(serviceCalls()[0][1]).toMatchObject({ metadata: { name: 'from-yaml' } })
    expect(serviceCalls()[0][2]).toEqual({ params: { dryRun: 'true' } })
  })
})
