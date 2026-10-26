/** A timestamp as the browser's locale shows it; `-` when absent, the raw value when unparsable. */
export function formatTimestamp(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

/** A short age such as `12s`, `3m`, `2h` or `4d`; `-` when absent or unparsable. */
export function formatAge(value?: string | null, now: number = Date.now()): string {
  if (!value) return '-'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return '-'
  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/**
 * The hash of a revision name: the segment after the last hyphen of a per-revision Service
 * (`llama-engine-rev-5f9b7c8d4`) or ControllerRevision (`llama-engine-5f9b7c8d4`) name. A bare
 * hash, or any name without a hyphen, is returned whole.
 */
export function revisionHash(name: string): string {
  const index = name.lastIndexOf('-')
  return index >= 0 && index < name.length - 1 ? name.slice(index + 1) : name
}

/** `revisionHash` capped at 12 characters, for table cells that show the full name as a tooltip. */
export function shortRevision(name: string): string {
  const hash = revisionHash(name)
  return hash.length > 12 ? hash.slice(0, 12) : hash
}
