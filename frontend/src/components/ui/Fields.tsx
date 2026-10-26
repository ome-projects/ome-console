import type { ReactNode } from 'react'

const columnClasses = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

interface FieldGridProps {
  children: ReactNode
  columns?: keyof typeof columnClasses
  className?: string
}

/** A responsive description list of `Field`s. */
export function FieldGrid({ children, columns = 3, className = '' }: FieldGridProps) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${columnClasses[columns]} ${className}`}>
      {children}
    </dl>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
  /** Tooltip on the value. */
  title?: string
  className?: string
}

/** One labelled value of a `FieldGrid`. */
export function Field({ label, children, title, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground" title={title}>
        {children}
      </dd>
    </div>
  )
}
