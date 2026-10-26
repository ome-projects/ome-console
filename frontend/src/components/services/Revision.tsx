import { shortRevision } from '@/lib/utils'

interface RevisionProps {
  /** A revision hash, a per-revision Service name or a ControllerRevision name. */
  name?: string
  className?: string
}

/** A revision shortened to its hash, with the full name as the tooltip; `-` when unset. */
export function Revision({ name, className = '' }: RevisionProps) {
  if (!name) return <span className="text-muted-foreground">-</span>
  return (
    <span className={`font-mono text-xs ${className}`} title={name}>
      {shortRevision(name)}
    </span>
  )
}
