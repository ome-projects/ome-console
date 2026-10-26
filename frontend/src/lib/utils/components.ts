/** InferenceService component names in the order the console shows them. */
export const COMPONENT_ORDER = ['engine', 'decoder', 'router'] as const

/** Sorts component names engine, decoder, router first; anything else follows alphabetically. */
export function sortComponents(names: string[]): string[] {
  const rank = (name: string) => {
    const index = (COMPONENT_ORDER as readonly string[]).indexOf(name)
    return index === -1 ? COMPONENT_ORDER.length : index
  }
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** `engine` as `Engine`, for headings and accessible names. */
export function componentLabel(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name
}
