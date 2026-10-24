import { apiClient } from './client'
import {
  ClusterServingRuntime,
  RuntimeMatch,
  CompatibilityCheck,
  RuntimeValidationResult,
} from '../types/runtime'
import { ListResponse } from '../types/common'

export interface CompatibleRuntimesResponse {
  matches: RuntimeMatch[]
  total: number
}

/** `/runtimes/<name>` for a ClusterServingRuntime, `/namespaces/<ns>/runtimes/<name>` for a ServingRuntime. */
const runtimePath = (name: string, namespace?: string) =>
  namespace
    ? `/namespaces/${encodeURIComponent(namespace)}/runtimes/${encodeURIComponent(name)}`
    : `/runtimes/${encodeURIComponent(name)}`

export const runtimesApi = {
  /** Lists ClusterServingRuntimes, or the ServingRuntimes of `namespace` when one is given. */
  list: async (namespace?: string): Promise<ListResponse<ClusterServingRuntime>> => {
    const params = namespace ? { namespace } : {}
    const response = await apiClient.get<ListResponse<ClusterServingRuntime>>('/runtimes', {
      params,
    })
    return response.data
  },

  get: async (name: string, namespace?: string): Promise<ClusterServingRuntime> => {
    const response = await apiClient.get<ClusterServingRuntime>(runtimePath(name, namespace))
    return response.data
  },

  /** Creates a ServingRuntime when the object carries `metadata.namespace`, else a ClusterServingRuntime. */
  create: async (runtime: Partial<ClusterServingRuntime>): Promise<ClusterServingRuntime> => {
    const namespace = runtime.metadata?.namespace
    const path = namespace ? `/namespaces/${encodeURIComponent(namespace)}/runtimes` : '/runtimes'
    const response = await apiClient.post<ClusterServingRuntime>(path, runtime)
    return response.data
  },

  update: async (
    name: string,
    runtime: Partial<ClusterServingRuntime>,
    namespace?: string
  ): Promise<ClusterServingRuntime> => {
    const response = await apiClient.put<ClusterServingRuntime>(
      runtimePath(name, namespace ?? runtime.metadata?.namespace),
      runtime
    )
    return response.data
  },

  delete: async (name: string, namespace?: string): Promise<void> => {
    await apiClient.delete(runtimePath(name, namespace))
  },

  // Intelligence features
  findCompatible: async (
    format: string,
    framework?: string
  ): Promise<CompatibleRuntimesResponse> => {
    const params: Record<string, string> = { format }
    if (framework) params.framework = framework
    const response = await apiClient.get<CompatibleRuntimesResponse>('/runtimes/compatible', {
      params,
    })
    return response.data
  },

  checkCompatibility: async (
    name: string,
    format: string,
    framework?: string
  ): Promise<CompatibilityCheck> => {
    const params: Record<string, string> = { format }
    if (framework) params.framework = framework
    const response = await apiClient.get<CompatibilityCheck>(`/runtimes/${name}/compatibility`, {
      params,
    })
    return response.data
  },

  getRecommendation: async (format: string, framework?: string): Promise<RuntimeMatch> => {
    const params: Record<string, string> = { format }
    if (framework) params.framework = framework
    const response = await apiClient.get<RuntimeMatch>('/runtimes/recommend', { params })
    return response.data
  },

  validate: async (runtime: Partial<ClusterServingRuntime>): Promise<RuntimeValidationResult> => {
    const response = await apiClient.post<RuntimeValidationResult>('/runtimes/validate', runtime)
    return response.data
  },

  clone: async (name: string, newName: string): Promise<ClusterServingRuntime> => {
    const response = await apiClient.post<ClusterServingRuntime>(`/runtimes/${name}/clone`, {
      newName,
    })
    return response.data
  },
}
