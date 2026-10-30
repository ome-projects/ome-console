import { clsx } from 'clsx'

/**
 * Values the badge knows: model `status.state`, the `Ready` condition read as `readyState`,
 * component `rolloutPhase`, `status.placement.phase`, console-side labels for conditions and
 * runtimes. Anything else renders with the neutral fallback and its raw label.
 */
type StatusState =
  // Model states (ModelStatusSpecStateValues)
  | 'Creating'
  | 'Importing'
  | 'In_Transit'
  | 'In_Training'
  | 'Ready'
  | 'Failed'
  // Service readiness (readyState)
  | 'NotReady'
  | 'Unknown'
  // Component rolloutPhase (ComponentStatusSpecRolloutPhaseValues)
  | 'Stable'
  | 'Canarying'
  | 'Pending'
  | 'Paused'
  | 'Promoting'
  | 'RollingBack'
  | 'RolledBack'
  // Placement phase (PlacementStatusPhaseValues)
  | 'Admitting'
  | 'Racing'
  | 'Placed'
  // Console labels
  | 'Running'
  | 'Active'
  | 'Disabled'
  | 'Drifted'
  | 'InSync'
  | 'Extracted'
  | string

interface StatusBadgeProps {
  state: StatusState | undefined | null
  className?: string
  size?: 'sm' | 'md'
  /** Shown as the badge's tooltip, e.g. a condition's reason and message. */
  title?: string
}

type Tone = 'success' | 'warning' | 'destructive' | 'accent' | 'muted'

interface StatusStyle {
  tone: Tone
  /** The state is in progress: the dot pulses. */
  busy?: boolean
  /** Human label; defaults to the state with underscores replaced by spaces. */
  label?: string
}

const toneClasses: Record<Tone, { bg: string; text: string; dot: string }> = {
  success: { bg: 'bg-success/10 border-success/20', text: 'text-success', dot: 'bg-success' },
  warning: { bg: 'bg-warning/10 border-warning/20', text: 'text-warning', dot: 'bg-warning' },
  destructive: {
    bg: 'bg-destructive/10 border-destructive/20',
    text: 'text-destructive',
    dot: 'bg-destructive',
  },
  accent: { bg: 'bg-accent/10 border-accent/20', text: 'text-accent', dot: 'bg-accent' },
  muted: {
    bg: 'bg-muted border-border',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
}

const statusStyles: Record<string, StatusStyle> = {
  // Model states
  Creating: { tone: 'accent', busy: true },
  Importing: { tone: 'accent', busy: true },
  In_Transit: { tone: 'warning', busy: true, label: 'In transit' },
  In_Training: { tone: 'accent', busy: true, label: 'In training' },
  Ready: { tone: 'success' },
  Failed: { tone: 'destructive' },
  // Service readiness
  NotReady: { tone: 'warning', label: 'Not ready' },
  Unknown: { tone: 'muted' },
  // Component rollout phases
  Stable: { tone: 'success' },
  Canarying: { tone: 'accent', busy: true },
  Pending: { tone: 'warning', busy: true },
  Paused: { tone: 'warning' },
  Promoting: { tone: 'accent', busy: true },
  RollingBack: { tone: 'warning', busy: true, label: 'Rolling back' },
  RolledBack: { tone: 'warning', label: 'Rolled back' },
  // Placement phases
  Admitting: { tone: 'accent', busy: true },
  Racing: { tone: 'accent', busy: true },
  Placed: { tone: 'success' },
  // Console labels
  Running: { tone: 'success' },
  Active: { tone: 'success' },
  Disabled: { tone: 'muted' },
  Drifted: { tone: 'warning' },
  InSync: { tone: 'success', label: 'In sync' },
  Extracted: { tone: 'success' },
}

const fallbackStyle: StatusStyle = { tone: 'muted' }

/** The label the badge shows for a state. */
export function statusLabel(state: string): string {
  return statusStyles[state]?.label ?? state.replace(/_/g, ' ')
}

export function StatusBadge({ state, className = '', size = 'md', title }: StatusBadgeProps) {
  const normalizedState = state || 'Unknown'
  const style = statusStyles[normalizedState] ?? fallbackStyle
  const colors = toneClasses[style.tone]

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-3 py-1 text-xs gap-1.5'

  const dotSize = size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5'

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-medium',
        colors.bg,
        colors.text,
        sizeClasses,
        className
      )}
      title={title}
      data-state={normalizedState}
    >
      <span className={clsx('rounded-full', colors.dot, dotSize, style.busy && 'animate-pulse')} />
      {statusLabel(normalizedState)}
    </span>
  )
}
