import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import EditModelPage from './page'

const fixtures = vi.hoisted(() => ({
  model: {
    apiVersion: 'ome.io/v1beta1',
    kind: 'ClusterBaseModel',
    metadata: { name: 'llama', resourceVersion: '7' },
    spec: {
      modelFormat: { name: 'safetensors', version: '1', operator: 'GreaterThan', weight: 5 },
      modelFramework: { name: 'transformers', version: '4.44', operator: 'Equal', weight: 2 },
      storage: { storageUri: 'hf://meta-llama/Llama-3.1-8B' },
    },
  },
  update: vi.fn<(args: { model: { spec: Record<string, unknown> } }) => Promise<void>>(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/lib/hooks/useResourceRef', () => ({ useResourceRef: () => ({ name: 'llama' }) }))

vi.mock('@/lib/hooks/useModels', () => ({
  useModel: () => ({ data: fixtures.model, isLoading: false, error: null }),
  useUpdateModel: () => ({ mutateAsync: fixtures.update, isPending: false }),
}))

describe('EditModelPage', () => {
  it('keeps the operator and weight of the format and framework when saving', async () => {
    fixtures.update.mockResolvedValue(undefined)
    renderWithQuery(<EditModelPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(fixtures.update).toHaveBeenCalledTimes(1))
    const { spec } = fixtures.update.mock.calls[0][0].model
    expect(spec.modelFormat).toMatchObject({
      name: 'safetensors',
      operator: 'GreaterThan',
      weight: 5,
    })
    expect(spec.modelFramework).toMatchObject({
      name: 'transformers',
      operator: 'Equal',
      weight: 2,
    })
  })
})
