/** Sets `key` when `value` is defined, otherwise removes it, so an empty form field clears the key. */
export function setOrDelete<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value === undefined) {
    delete target[key]
  } else {
    target[key] = value
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The object without its undefined values, or undefined when nothing is left. */
export function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined)
    return items.length > 0 ? items : undefined
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return value
    const kept = entries
      .map(([key, item]) => [key, prune(item)] as const)
      .filter(([, item]) => item !== undefined)
    return kept.length > 0 ? Object.fromEntries(kept) : undefined
  }
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isNaN(value)) return undefined
  return value
}

/**
 * The value without the leftovers of untouched form inputs: undefined, null, NaN and empty
 * strings are dropped, as are empty arrays and the objects that dropping left empty. An object
 * that was empty to begin with (`emptyDir: {}`) is kept. Undefined when nothing is left.
 */
export function pruneEmpty<T>(value: T): T | undefined {
  return prune(value) as T | undefined
}
