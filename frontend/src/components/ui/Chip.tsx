import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export type ChipTone = 'muted' | 'accent' | 'success' | 'warning' | 'destructive'

const toneClasses: Record<ChipTone, string> = {
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

interface ChipProps {
  children: ReactNode
  tone?: ChipTone
  /** Render the content in a monospace font, for names and digests. */
  mono?: boolean
  title?: string
  className?: string
}

/** A small inline label: a kind, a mode, a tag. */
export function Chip({ children, tone = 'muted', mono = false, title, className = '' }: ChipProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
        mono && 'font-mono',
        className
      )}
      title={title}
    >
      {children}
    </span>
  )
}
