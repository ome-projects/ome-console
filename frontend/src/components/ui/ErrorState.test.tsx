import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('renders a plain Error', () => {
    render(<ErrorState error={new Error('boom')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('renders an API error with its code and validation causes', () => {
    render(
      <ErrorState
        error={{
          status: 422,
          code: 'INVALID',
          message: 'InferenceService "x" is invalid',
          details: [
            { field: 'spec.engine', reason: 'FieldValueRequired', message: 'Required value' },
          ],
        }}
      />
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('InferenceService "x" is invalid')
    expect(alert).toHaveTextContent('422 INVALID')
    expect(alert).toHaveTextContent('spec.engine')
    expect(alert).toHaveTextContent('Required value')
  })

  it('explains a missing capability', () => {
    render(
      <ErrorState
        error={{ status: 404, code: 'CAPABILITY_MISSING', message: 'rolloutpolicies: not served' }}
        backLink={{ href: '/dashboard', label: 'Back' }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('not available on the connected cluster')
    expect(screen.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/dashboard')
  })

  it('falls back for unknown error shapes', () => {
    render(<ErrorState error={42} compact />)
    expect(screen.getByRole('alert')).toHaveTextContent('An unexpected error occurred')
  })
})
