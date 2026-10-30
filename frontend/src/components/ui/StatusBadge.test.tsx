import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, statusLabel } from './StatusBadge'

describe('StatusBadge', () => {
  it('colours model states', () => {
    const { rerender } = render(<StatusBadge state="Ready" />)
    expect(screen.getByText('Ready')).toHaveClass('text-success')

    rerender(<StatusBadge state="In_Transit" />)
    expect(screen.getByText('In transit')).toHaveClass('text-warning')

    rerender(<StatusBadge state="Failed" />)
    expect(screen.getByText('Failed')).toHaveClass('text-destructive')
  })

  it('colours service readiness and rollout phases', () => {
    const { rerender } = render(<StatusBadge state="NotReady" />)
    expect(screen.getByText('Not ready')).toHaveClass('text-warning')

    rerender(<StatusBadge state="Canarying" />)
    expect(screen.getByText('Canarying')).toHaveClass('text-accent')

    rerender(<StatusBadge state="RolledBack" />)
    expect(screen.getByText('Rolled back')).toHaveClass('text-warning')

    rerender(<StatusBadge state="Stable" />)
    expect(screen.getByText('Stable')).toHaveClass('text-success')
  })

  it('colours placement phases', () => {
    const { rerender } = render(<StatusBadge state="Placed" />)
    expect(screen.getByText('Placed')).toHaveClass('text-success')

    rerender(<StatusBadge state="Admitting" />)
    expect(screen.getByText('Admitting')).toHaveClass('text-accent')
  })

  it('falls back to a neutral badge for unknown values and missing state', () => {
    const { rerender } = render(<StatusBadge state="SomethingNew" />)
    expect(screen.getByText('SomethingNew')).toHaveClass('text-muted-foreground')

    rerender(<StatusBadge state={undefined} />)
    expect(screen.getByText('Unknown')).toHaveClass('text-muted-foreground')
  })

  it('exposes the tooltip and the raw state', () => {
    render(<StatusBadge state="NotReady" size="sm" title="Initializing: engine not ready" />)
    const badge = screen.getByText('Not ready')
    expect(badge).toHaveAttribute('title', 'Initializing: engine not ready')
    expect(badge).toHaveAttribute('data-state', 'NotReady')
    expect(badge).toHaveClass('px-2')
  })

  it('labels multi-word states', () => {
    expect(statusLabel('In_Training')).toBe('In training')
    expect(statusLabel('RollingBack')).toBe('Rolling back')
    expect(statusLabel('Paused')).toBe('Paused')
  })
})
