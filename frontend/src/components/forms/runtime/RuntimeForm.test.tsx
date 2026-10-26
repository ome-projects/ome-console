import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { apiClient } from '@/lib/api/client'
import type { Runtime } from '@/lib/types/runtime'
import { RuntimeForm } from './RuntimeForm'

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>

const profile: Runtime = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'ClusterServingRuntime',
  metadata: { name: 'sglang-profile', annotations: { 'ome.io/runtime-profile': 'true' } },
  spec: { disabled: true },
}

const stored: Runtime = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'ClusterServingRuntime',
  metadata: {
    name: 'vllm',
    resourceVersion: '42',
    labels: { team: 'a' },
    annotations: { 'ome.io/inherit-from': 'sglang-profile' },
  },
  spec: {
    supportedModelFormats: [
      {
        modelFormat: { name: 'safetensors' },
        modelFramework: { name: 'transformers' },
        autoSelect: true,
      },
    ],
    modelSizeRange: { min: '1B', max: '70B' },
    tolerations: [{ key: 'nvidia.com/gpu', operator: 'Exists', effect: 'NoSchedule' }],
    engineConfig: {
      minReplicas: 1,
      maxReplicas: 3,
      autoscaler: {
        class: 'HPA',
        hpa: {
          metrics: [
            {
              type: 'Resource',
              resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 60 } },
            },
          ],
          behavior: { scaleDown: { stabilizationWindowSeconds: 300 } },
        },
      },
      leader: { runner: { name: 'ome-container', image: 'vllm:leader' } },
      worker: { size: 2, runner: { name: 'ome-container', image: 'vllm:worker' } },
      runner: {
        name: 'ome-container',
        image: 'vllm:latest',
        env: [{ name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf', key: 'token' } } }],
        readinessProbe: { httpGet: { path: '/health', port: 8080 } },
      },
      volumes: [{ name: 'dshm', emptyDir: { medium: 'Memory' } }],
    },
  },
}

function mockReads() {
  get.mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
    switch (url) {
      case '/namespaces':
        return { data: { items: ['default', 'team-a'], total: 2 } }
      case '/runtimes':
        return {
          data: config?.params?.namespace
            ? { items: [], total: 0 }
            : { items: [profile, stored], total: 2 },
        }
      case '/capabilities':
        return { data: { omeInstalled: true, resources: {}, features: {}, checkedAt: '' } }
      default:
        if (url.endsWith('/autoscalerpolicies')) return { data: { items: [], total: 0 } }
        throw new Error(`unexpected GET ${url}`)
    }
  })
}

const cpuMetric = (averageUtilization: number) => ({
  type: 'Resource',
  resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization } },
})

describe('RuntimeForm', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    put.mockReset()
    mockReads()
    post.mockImplementation(async (_url: string, body: unknown) => ({ data: body }))
    put.mockImplementation(async (_url: string, body: unknown) => ({ data: body }))
  })

  it('edits losslessly: resets with the stored object and writes it back after a dry run', async () => {
    const onSuccess = vi.fn()
    renderWithQuery(
      <RuntimeForm
        mode="edit"
        initialData={stored}
        onSuccess={onSuccess}
        backLink="/runtimes"
        backLinkText="Back"
      />
    )

    expect(screen.getByLabelText('Name *')).toHaveValue('vllm')
    expect(screen.getByLabelText('Name *')).toBeDisabled()
    expect(screen.getByLabelText('Minimum Size')).toHaveValue('1B')
    await screen.findByRole('option', { name: 'sglang-profile' })
    expect(screen.getByLabelText('Inherit from')).toHaveValue('sglang-profile')
    fireEvent.change(screen.getByLabelText('Maximum Size'), { target: { value: '8B' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(put.mock.calls.map((call) => call[0])).toEqual(['/runtimes/vllm', '/runtimes/vllm'])
    expect(put.mock.calls[0][2]).toEqual({ params: { dryRun: 'true' } })
    expect(put.mock.calls[1][2]).toEqual({ params: undefined })
    const sent = put.mock.calls[1][1] as Runtime
    expect(sent.apiVersion).toBe('ome.io/v1beta1')
    expect(sent.kind).toBe('ClusterServingRuntime')
    expect(sent.metadata).toEqual(stored.metadata)
    expect(sent.spec).toEqual({
      ...stored.spec,
      disabled: false,
      modelSizeRange: { min: '1B', max: '8B' },
    })
    expect(onSuccess).toHaveBeenCalledWith(sent)
  })

  it('creates a ServingRuntime in its namespace, dry run first, with the autoscaler under engineConfig', async () => {
    const onSuccess = vi.fn()
    renderWithQuery(
      <RuntimeForm mode="create" onSuccess={onSuccess} backLink="/runtimes" backLinkText="Back" />
    )

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'my-runtime' } })
    fireEvent.click(screen.getByRole('radio', { name: /^ServingRuntime/ }))
    await screen.findByRole('option', { name: 'team-a' })
    fireEvent.change(screen.getByLabelText('Namespace *'), { target: { value: 'team-a' } })

    fireEvent.click(screen.getByRole('button', { name: /Supported Model Formats/ }))
    fireEvent.change(screen.getByLabelText('Format Name *'), { target: { value: 'safetensors' } })
    fireEvent.change(screen.getByLabelText('Framework Name *'), {
      target: { value: 'transformers' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Engine Configuration/ }))
    fireEvent.change(screen.getByLabelText('Min replicas'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Max replicas'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Autoscaler class'), { target: { value: 'HPA' } })
    fireEvent.change(await screen.findByLabelText('CPU target (%)'), { target: { value: '70' } })

    // A profile must be disabled; the toggle forces it.
    fireEvent.click(screen.getByRole('checkbox', { name: /^Runtime profile/ }))
    const disabled = screen.getByRole('checkbox', { name: /^Disabled/ })
    expect(disabled).toBeChecked()
    expect(disabled).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Create Runtime' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      '/namespaces/team-a/runtimes',
      '/namespaces/team-a/runtimes',
    ])
    expect(post.mock.calls[0][2]).toEqual({ params: { dryRun: 'true' } })
    expect(post.mock.calls[1][2]).toEqual({ params: undefined })
    expect(post.mock.calls[1][1]).toEqual({
      apiVersion: 'ome.io/v1beta1',
      kind: 'ServingRuntime',
      metadata: {
        name: 'my-runtime',
        namespace: 'team-a',
        annotations: { 'ome.io/runtime-profile': 'true' },
      },
      spec: {
        supportedModelFormats: [
          {
            modelFormat: { name: 'safetensors' },
            modelFramework: { name: 'transformers' },
            autoSelect: false,
          },
        ],
        disabled: true,
        engineConfig: {
          minReplicas: 1,
          maxReplicas: 4,
          autoscaler: { class: 'HPA', hpa: { metrics: [cpuMetric(70)] } },
        },
      },
    })
  })

  it('shows the dry run causes and does not write when the API server rejects it', async () => {
    const onSuccess = vi.fn()
    put.mockImplementation(
      async (_url: string, body: unknown, config?: { params?: Record<string, string> }) => {
        if (config?.params?.dryRun === 'true') {
          throw {
            status: 422,
            code: 'INVALID',
            message: 'ClusterServingRuntime "vllm" is invalid',
            details: [
              {
                field: 'spec.engineConfig.maxReplicas',
                reason: 'FieldValueInvalid',
                message: 'must be greater than or equal to 1',
              },
            ],
          }
        }
        return { data: body }
      }
    )
    renderWithQuery(
      <RuntimeForm
        mode="edit"
        initialData={stored}
        onSuccess={onSuccess}
        backLink="/runtimes"
        backLinkText="Back"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Validate (dry run)' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ClusterServingRuntime "vllm" is invalid')
    expect(alert).toHaveTextContent('spec.engineConfig.maxReplicas')
    expect(alert).toHaveTextContent('must be greater than or equal to 1')
    expect(put).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('lists the form errors before sending anything', async () => {
    renderWithQuery(
      <RuntimeForm mode="create" onSuccess={vi.fn()} backLink="/runtimes" backLinkText="Back" />
    )
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'my-runtime' } })
    fireEvent.change(screen.getByLabelText('Maximum Size'), { target: { value: '4b' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Runtime' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'spec.modelSizeRange.max: Use a number with an optional uppercase M, B or T suffix'
    )
    expect(alert).toHaveTextContent(
      'spec.supportedModelFormats.0.modelFormat.name: Format name is required'
    )
    expect(post).not.toHaveBeenCalled()
  })
})
