import type { Condition } from '../types/common'

/** An object's readiness as `kubectl get` shows it: its `Ready` condition. */
export type ReadyState = 'Ready' | 'NotReady' | 'Unknown'

/**
 * Reads the `Ready` condition. InferenceServices have no `status.state`; OME reports readiness
 * only through conditions, and also sets Ready to False while a service starts (reason
 * `Initializing`), so False means not ready rather than failed.
 */
export function readyState(conditions?: Condition[]): ReadyState {
  const ready = conditions?.find((c) => c.type === 'Ready')
  if (ready?.status === 'True') return 'Ready'
  if (ready?.status === 'False') return 'NotReady'
  return 'Unknown'
}
