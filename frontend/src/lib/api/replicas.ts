import { createResourceApi } from './createResourceApi'
import { InferenceReplica } from '../types/replica'

/**
 * InferenceReplicas are namespaced: `/namespaces/<ns>/replicas[/<name>]`, with `/replicas`
 * listing across namespaces. The backend answers 404 CAPABILITY_MISSING on clusters without
 * the CRD (OME before v1.3).
 */
export const replicasApi = createResourceApi<InferenceReplica>('replicas', { namespaced: true })
