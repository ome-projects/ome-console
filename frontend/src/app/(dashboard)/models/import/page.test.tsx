import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '@/test/utils'
import ImportModelPage from './page'

const fixtures = vi.hoisted(() => ({
  results: [
    {
      id: 'meta-llama/Llama-3.1-8B',
      modelId: 'meta-llama/Llama-3.1-8B',
      downloads: 10,
      likes: 1,
      pipeline_tag: 'text-generation',
      library_name: 'transformers',
    },
  ],
  info: { detectedFormat: 'safetensors' },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/lib/hooks/useHuggingFace', () => ({
  useHuggingFaceSearch: () => ({ data: fixtures.results, isLoading: false }),
  useHuggingFaceModelInfo: (modelId: string | null) => ({
    data: modelId ? fixtures.info : undefined,
    isLoading: false,
  }),
  useHuggingFaceModelConfig: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('@/lib/hooks/useNamespaces', () => ({
  useNamespaces: () => ({ data: { items: ['default'] }, isLoading: false }),
}))

describe('ImportModelPage', () => {
  it('fills in the detected format on every selection, including the same model again', () => {
    renderWithQuery(<ImportModelPage />)
    const format = () => (screen.getByLabelText('Model Format *') as HTMLSelectElement).value

    fireEvent.click(screen.getByText('meta-llama/Llama-3.1-8B'))
    expect(format()).toBe('safetensors')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByText('meta-llama/Llama-3.1-8B'))
    expect(format()).toBe('safetensors')
  })
})
