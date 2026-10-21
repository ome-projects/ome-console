import Link from 'next/link'
import { isApiError, type ApiError } from '@/lib/types/api'

interface ErrorStateProps {
  error: Error | ApiError | unknown
  backLink?: {
    href: string
    label: string
  }
  className?: string
  /** Render inline inside a page instead of filling the viewport. */
  compact?: boolean
}

interface ErrorCause {
  field?: string
  reason?: string
  message: string
}

function describe(error: unknown): { title: string; code?: string; causes: ErrorCause[] } {
  if (isApiError(error)) {
    const causes = Array.isArray(error.details)
      ? (error.details as ErrorCause[]).filter((c) => c && typeof c.message === 'string')
      : typeof error.details === 'string'
        ? [{ message: error.details }]
        : []
    const title =
      error.code === 'CAPABILITY_MISSING'
        ? 'This feature is not available on the connected cluster'
        : error.message
    return { title, code: `${error.status || ''} ${error.code}`.trim(), causes }
  }
  if (error instanceof Error) return { title: error.message, causes: [] }
  return { title: 'An unexpected error occurred', causes: [] }
}

export function ErrorState({ error, backLink, className = '', compact = false }: ErrorStateProps) {
  const { title, code, causes } = describe(error)
  const detail = isApiError(error) && error.code === 'CAPABILITY_MISSING' ? error.message : null

  return (
    <div
      className={`flex ${compact ? 'py-8' : 'min-h-screen'} items-center justify-center ${className}`}
      role="alert"
    >
      <div className="max-w-xl text-center">
        <div className="text-lg text-red-600 mb-2">{title}</div>
        {code && (
          <div className="mb-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {code}
            </span>
          </div>
        )}
        {detail && <p className="mb-3 text-sm text-muted-foreground">{detail}</p>}
        {causes.length > 0 && (
          <ul className="mb-4 text-left text-sm text-muted-foreground space-y-1">
            {causes.map((cause, index) => (
              <li key={index} className="rounded-md bg-muted/50 px-3 py-2">
                {cause.field && <span className="font-mono text-xs mr-2">{cause.field}</span>}
                {cause.message}
              </li>
            ))}
          </ul>
        )}
        {backLink && (
          <Link href={backLink.href} className="text-blue-600 hover:text-blue-800">
            ← {backLink.label}
          </Link>
        )}
      </div>
    </div>
  )
}
