import { apiClient } from './client'
import { ModelEvent } from '../types/model'

/** A Kubernetes event as the backend reports it, the same shape as model events. */
export type ObjectEvent = ModelEvent

export interface ObjectEventsResponse {
  events: ObjectEvent[]
  total: number
}

export interface ObjectRef {
  namespace: string
  kind: string
  name: string
}

export const objectEventsApi = {
  /** Events recorded for one object, newest first. */
  list: async ({ namespace, kind, name }: ObjectRef): Promise<ObjectEventsResponse> => {
    const response = await apiClient.get<ObjectEventsResponse>(
      `/namespaces/${encodeURIComponent(namespace)}/events`,
      { params: { kind, name } }
    )
    return response.data
  },
}
