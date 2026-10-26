import { apiClient } from './client'
import type { InferenceReplica, OMENativeInstanceStatus } from '../types/replica'

/** How the backend found the instance rows on the InferenceReplica. */
export type InstanceStatusEncoding = 'DenseV1' | 'ColumnarV2'

/**
 * One InferenceReplica of a service with its instance rows decoded by the backend. The replica's
 * status comes without `instanceStatuses`, `instanceStatusEncoding` and `instanceStatusColumns`;
 * `instances` carries the rows in their canonical order, and `decodeError` says why they could
 * not be decoded (then `instances` is empty).
 */
export interface DecodedServiceReplica {
  replica: InferenceReplica
  encoding: InstanceStatusEncoding
  instances: OMENativeInstanceStatus[]
  decodeError?: string
}

export interface ServiceReplicasResponse {
  items: DecodedServiceReplica[]
  total: number
}

export const serviceReplicasApi = {
  /** The InferenceReplicas OME projects for a service, one per OMENative component, decoded. */
  list: async (namespace: string, name: string): Promise<ServiceReplicasResponse> => {
    const response = await apiClient.get<ServiceReplicasResponse>(
      `/namespaces/${encodeURIComponent(namespace)}/services/${encodeURIComponent(name)}/replicas`
    )
    return response.data
  },
}
