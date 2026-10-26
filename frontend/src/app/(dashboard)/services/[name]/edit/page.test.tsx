import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import type { InferenceService } from '@/lib/types/service'
import type { ServiceFormProps } from '@/components/forms/service/ServiceForm'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ name: 'llama' }),
  useSearchParams: () => new URLSearchParams('namespace=team-a'),
  usePathname: () => '/services/llama/edit',
}))

vi.mock('@/lib/api/services', () => ({
  servicesApi: { get: vi.fn() },
}))

vi.mock('@/components/forms/service', () => ({
  ServiceForm: (props: ServiceFormProps) => (
    <div
      data-testid="service-form"
      data-mode={props.mode}
      data-tab={props.defaultTab}
      data-back={props.backLink}
    >
      <button type="button" onClick={() => props.onSuccess(props.initialData as InferenceService)}>
        saved {props.initialData?.metadata.name}
      </button>
    </div>
  ),
}))

import { servicesApi } from '@/lib/api/services'
import EditServicePage from './page'

const service: InferenceService = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'InferenceService',
  metadata: { name: 'llama', namespace: 'team-a', resourceVersion: '42' },
  spec: { model: { name: 'llama-3-8b' } },
}

describe('EditServicePage', () => {
  beforeEach(() => {
    push.mockClear()
    vi.mocked(servicesApi.get).mockReset()
  })

  it('loads the service by name and namespace and opens the form on the YAML tab', async () => {
    vi.mocked(servicesApi.get).mockResolvedValue(service)
    renderWithQuery(<EditServicePage />)

    const form = await screen.findByTestId('service-form')
    expect(servicesApi.get).toHaveBeenCalledWith('llama', 'team-a')
    expect(form).toHaveAttribute('data-mode', 'edit')
    expect(form).toHaveAttribute('data-tab', 'yaml')
    expect(form).toHaveAttribute('data-back', '/services/llama?namespace=team-a')
    expect(form).toHaveTextContent('saved llama')

    screen.getByRole('button', { name: /saved llama/ }).click()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/services/llama?namespace=team-a'))
  })

  it('shows an error with a way back when the service does not exist', async () => {
    vi.mocked(servicesApi.get).mockRejectedValue({
      status: 404,
      code: 'NOT_FOUND',
      message: 'inferenceservices.ome.io "llama" not found',
    })
    renderWithQuery(<EditServicePage />)

    await waitFor(() => expect(screen.getByText(/"llama" not found/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Back to Services/ })).toHaveAttribute(
      'href',
      '/services'
    )
    expect(screen.queryByTestId('service-form')).not.toBeInTheDocument()
  })
})
