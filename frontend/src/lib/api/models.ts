import { apiClient } from './client'
import { ClusterBaseModel, BaseModel, ModelEvent } from '../types/model'
import { ListResponse } from '../types/common'

export interface ModelEventsResponse {
  events: ModelEvent[]
  total: number
}

// Progress data from ConfigMap (real-time download progress)
export interface NodeDownloadProgress {
  node: string
  phase: string // Scanning, Downloading, Finalizing
  totalBytes: number
  completedBytes: number
  bytesPerSecond: number
  remainingTime: number // ETA in seconds
  percentage: number // 0-100
}

export interface ModelProgressResponse {
  progress: NodeDownloadProgress[]
  total: number
}

/** `/models/<name>` for a ClusterBaseModel, `/namespaces/<ns>/models/<name>` for a BaseModel. */
const modelPath = (name: string, namespace?: string) =>
  namespace
    ? `/namespaces/${encodeURIComponent(namespace)}/models/${encodeURIComponent(name)}`
    : `/models/${encodeURIComponent(name)}`

// ClusterBaseModel API (cluster-scoped), plus namespaced BaseModel access via `namespace`
export const modelsApi = {
  list: async (namespace?: string): Promise<ListResponse<ClusterBaseModel>> => {
    const params = namespace ? { namespace } : {}
    const response = await apiClient.get<ListResponse<ClusterBaseModel>>('/models', { params })
    return response.data
  },

  /** A ClusterBaseModel, or the BaseModel `name` in `namespace` when one is given. */
  get: async (name: string, namespace?: string): Promise<ClusterBaseModel> => {
    const response = await apiClient.get<ClusterBaseModel>(modelPath(name, namespace))
    return response.data
  },

  create: async (requestBody: {
    model: Partial<ClusterBaseModel>
    huggingfaceToken?: string
  }): Promise<ClusterBaseModel> => {
    const response = await apiClient.post<ClusterBaseModel>('/models', requestBody)
    return response.data
  },

  update: async (
    name: string,
    model: Partial<ClusterBaseModel>,
    namespace?: string
  ): Promise<ClusterBaseModel> => {
    const response = await apiClient.put<ClusterBaseModel>(modelPath(name, namespace), model)
    return response.data
  },

  delete: async (name: string, namespace?: string): Promise<void> => {
    await apiClient.delete(modelPath(name, namespace))
  },

  getStatus: async (name: string): Promise<unknown> => {
    const response = await apiClient.get(`/models/${name}/status`)
    return response.data
  },

  getEvents: async (name: string): Promise<ModelEventsResponse> => {
    const response = await apiClient.get<ModelEventsResponse>(`/models/${name}/events`)
    return response.data
  },

  // Get real-time download progress from ConfigMaps; pass the namespace for a BaseModel
  getProgress: async (name: string, namespace?: string): Promise<ModelProgressResponse> => {
    const response = await apiClient.get<ModelProgressResponse>(
      `${modelPath(name, namespace)}/progress`
    )
    return response.data
  },
}

// BaseModel API (namespace-scoped)
export const baseModelsApi = {
  list: async (namespace: string): Promise<ListResponse<BaseModel>> => {
    const response = await apiClient.get<ListResponse<BaseModel>>(`/namespaces/${namespace}/models`)
    return response.data
  },

  get: async (namespace: string, name: string): Promise<BaseModel> => {
    const response = await apiClient.get<BaseModel>(`/namespaces/${namespace}/models/${name}`)
    return response.data
  },

  create: async (
    namespace: string,
    requestBody: { model: Partial<BaseModel>; huggingfaceToken?: string }
  ): Promise<BaseModel> => {
    const response = await apiClient.post<BaseModel>(`/namespaces/${namespace}/models`, requestBody)
    return response.data
  },

  update: async (
    namespace: string,
    name: string,
    model: Partial<BaseModel>
  ): Promise<BaseModel> => {
    const response = await apiClient.put<BaseModel>(
      `/namespaces/${namespace}/models/${name}`,
      model
    )
    return response.data
  },

  delete: async (namespace: string, name: string): Promise<void> => {
    await apiClient.delete(`/namespaces/${namespace}/models/${name}`)
  },
}
