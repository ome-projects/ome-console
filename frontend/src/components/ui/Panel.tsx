import { forwardRef, type ReactNode } from 'react'

interface PanelProps {
  title: string
  /** One line under the title. */
  description?: string
  /** Controls at the right of the header. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled card: the section container of a detail page. Its accessible name is the title. */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { title, description, actions, children, className = '' },
  ref
) {
  return (
    <section
      ref={ref}
      aria-label={title}
      className={`rounded-xl border border-border bg-card shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
})
