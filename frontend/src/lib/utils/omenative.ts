import type { ComponentStatusSpec, InferenceService } from '../types/service'

/** OMENative manages the component through an InferenceReplica. */
export function isOMENativeComponent(status: ComponentStatusSpec): boolean {
  return status.scaleTargetRef?.kind === 'InferenceReplica' || !!status.lifecycle
}

/** The service runs OMENative somewhere: by mode, by fronting replicas, or per component. */
export function isOMENativeService(service: InferenceService): boolean {
  return (
    service.spec.deploymentMode === 'OMENative' ||
    !!service.spec.replicaRefs ||
    Object.values(service.status?.components ?? {}).some(isOMENativeComponent)
  )
}
