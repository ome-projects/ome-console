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
