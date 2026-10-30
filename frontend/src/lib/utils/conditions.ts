import type { Condition } from '../types/common'

/** An object's readiness as `kubectl get` shows it: its `Ready` condition. */
export type ReadyState = 'Ready' | 'NotReady' | 'Unknown'

/** The condition of the given type, if the object reports one. */
export function findCondition(
  conditions: Condition[] | undefined,
  type: string
): Condition | undefined {
  return conditions?.find((c) => c.type === type)
}

/**
 * A condition's status read as a readiness: True is Ready, False is NotReady, and Unknown or
 * absent is Unknown. Serves the `*Ready` conditions (`InheritanceReady`, `MetadataExtracted`...)
 * that a badge shows.
 */
export function conditionState(conditions: Condition[] | undefined, type: string): ReadyState {
  const condition = findCondition(conditions, type)
  if (condition?.status === 'True') return 'Ready'
  if (condition?.status === 'False') return 'NotReady'
  return 'Unknown'
}

/**
 * Reads the `Ready` condition. InferenceServices have no `status.state`; OME reports readiness
 * only through conditions, and also sets Ready to False while a service starts (reason
 * `Initializing`), so False means not ready rather than failed.
 */
export function readyState(conditions?: Condition[]): ReadyState {
  return conditionState(conditions, 'Ready')
}

/**
 * The reason and message of a condition joined as `Reason: message`, for a tooltip; the message
 * alone when there is no reason, or undefined when the condition is absent or carries neither.
 */
export function conditionReason(
  conditions: Condition[] | undefined,
  type: string
): string | undefined {
  const condition = findCondition(conditions, type)
  if (!condition) return undefined
  const reason = condition.reason?.trim()
  const message = condition.message?.trim()
  if (reason && message) return `${reason}: ${message}`
  return reason || message || undefined
}
