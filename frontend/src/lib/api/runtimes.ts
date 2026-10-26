import { apiClient } from './client'
import {
  ClusterServingRuntime,
  RuntimeMatch,
  CompatibilityCheck,
  RuntimeValidationResult,
  RuntimeExplainRequest,
  RuntimeExplainResponse,
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

  /**
   * Creates a ServingRuntime in its `metadata.namespace` when `kind` is ServingRuntime, else a
   * ClusterServingRuntime. The kind decides the scope, so an imported YAML is created as written.
   */
  create: async (runtime: Partial<ClusterServingRuntime>): Promise<ClusterServingRuntime> => {
    let path = '/runtimes'
    if (runtime.kind === 'ServingRuntime') {
      const namespace = runtime.metadata?.namespace
      if (!namespace) {
        throw new Error(`ServingRuntime ${runtime.metadata?.name ?? ''} needs metadata.namespace`)
      }
      path = `/namespaces/${encodeURIComponent(namespace)}/runtimes`
    }
    const response = await apiClient.post<ClusterServingRuntime>(path, runtime)
    return response.data
  },

  /**
   * Updates the ServingRuntime in `namespace`, else in `metadata.namespace` when `kind` is
   * ServingRuntime, else the ClusterServingRuntime. As in `create`, the kind decides the scope.
   */
  update: async (
    name: string,
    runtime: Partial<ClusterServingRuntime>,
    namespace?: string
  ): Promise<ClusterServingRuntime> => {
    const response = await apiClient.put<ClusterServingRuntime>(
      runtimePath(
        name,
        namespace ?? (runtime.kind === 'ServingRuntime' ? runtime.metadata?.namespace : undefined)
      ),
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

  /**
   * Ranks the ClusterServingRuntimes and the namespace's ServingRuntimes for a model, best
   * first, with the reasons and exclusions OME's own selector applies.
   */
  explain: async (request: RuntimeExplainRequest): Promise<RuntimeExplainResponse> => {
    const response = await apiClient.post<RuntimeExplainResponse>('/runtimes/explain', request)
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
