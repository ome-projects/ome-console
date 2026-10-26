import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InheritanceBadge, InheritanceChain, inheritFrom } from './RuntimeInheritance'
import type { ClusterServingRuntime } from '@/lib/types/runtime'

const child: ClusterServingRuntime = {
  apiVersion: 'ome.io/v1beta1',
  kind: 'ServingRuntime',
  metadata: {
    name: 'vllm-team',
    namespace: 'team-a',
    annotations: { 'ome.io/inherit-from': 'vllm-base' },
  },
  spec: {},
  status: {
    conditions: [
      { type: 'InheritanceReady', status: 'False', reason: 'ParentNotFound', message: 'no base' },
    ],
    inheritanceChain: ['vllm-root', 'vllm-base', 'vllm-team'],
  },
}

describe('RuntimeInheritance', () => {
  it('reads the inherit-from annotation', () => {
    expect(inheritFrom(child)).toBe('vllm-base')
    expect(inheritFrom({ ...child, metadata: { name: 'x' } })).toBeUndefined()
  })

  it('shows the InheritanceReady condition with its reason', () => {
    render(<InheritanceBadge runtime={child} size="sm" />)
    const badge = screen.getByText('Not ready')
    expect(badge).toHaveAttribute('data-state', 'NotReady')
    expect(badge).toHaveAttribute('title', 'ParentNotFound: no base')
  })

  it('renders nothing without the condition or with a single-entry chain', () => {
    const alone: ClusterServingRuntime = {
      ...child,
      status: { inheritanceChain: ['vllm-team'] },
    }
    const { container } = render(
      <>
        <InheritanceBadge runtime={alone} />
        <InheritanceChain runtime={alone} />
      </>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('links every ancestor in the chain within the runtime scope', () => {
    render(<InheritanceChain runtime={child} />)
    const nav = screen.getByRole('navigation', { name: 'Inheritance chain' })
    expect(nav).toHaveTextContent('vllm-root›vllm-base›vllm-team')
    expect(screen.getByRole('link', { name: 'vllm-root' })).toHaveAttribute(
      'href',
      '/runtimes/vllm-root?namespace=team-a'
    )
    expect(screen.getByRole('link', { name: 'vllm-base' })).toHaveAttribute(
      'href',
      '/runtimes/vllm-base?namespace=team-a'
    )
    expect(screen.queryByRole('link', { name: 'vllm-team' })).not.toBeInTheDocument()
  })
})
