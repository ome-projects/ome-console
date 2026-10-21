import { apiClient } from './client'

/** What the backend discovered about the connected cluster at startup. */
export interface Capabilities {
  /** False when the cluster does not serve the ome.io API group at all. */
  omeInstalled: boolean
  /** OME resource plural name (e.g. `inferencereplicas`) to whether the cluster serves it. */
  resources: Record<string, boolean>
  /** Console feature flag (e.g. `rolloutPolicy`) to whether the cluster supports it. */
  features: Record<string, boolean>
  checkedAt: string
}

export const capabilitiesApi = {
  get: async (): Promise<Capabilities> => {
    const response = await apiClient.get<Capabilities>('/capabilities')
    return response.data
  },
}
