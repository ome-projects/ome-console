// BaseModel and ClusterBaseModel types: aliases over the generated OME API types.

import type * as gen from './generated/ome.v1beta1'
import type { ObjectMeta, Resource } from './common'

export type { ResourceRequirements } from './common'

export type ModelFormat = gen.ModelFormat
export type ModelFrameworkSpec = gen.ModelFrameworkSpec
export type StorageSpec = gen.StorageSpec
export type ModelExtensionSpec = gen.ModelExtensionSpec
export type ModelStatusSpec = gen.ModelStatusSpec
export type ModelState = gen.ModelStatusSpecState
export type ModelDistribution = gen.BaseModelSpecDistribution
export type DownloadPolicy = gen.StorageSpecDownloadPolicy

export {
  ModelStatusSpecStateValues as ModelStates,
  BaseModelSpecDistributionValues as ModelDistributions,
  StorageSpecDownloadPolicyValues as DownloadPolicies,
} from './generated/ome.v1beta1'

/**
 * `spec.modelConfiguration` is free-form in the API. These are the keys OME's metadata
 * extractor writes from the Hugging Face config; anything else is passed through.
 */
export interface ModelConfigurationSpec {
  architecture?: string
  model_type?: string
  context_length?: number
  torch_dtype?: string
  transformers_version?: string
  has_vision?: boolean
  [key: string]: unknown
}

export type BaseModelSpec = Omit<gen.BaseModelSpec, 'modelConfiguration'> & {
  modelConfiguration?: ModelConfigurationSpec
}

export type ClusterBaseModel = Omit<Resource<gen.ClusterBaseModel>, 'spec'> & {
  spec: BaseModelSpec
}

// BaseModel is namespace-scoped
export type BaseModel = Omit<Resource<gen.BaseModel>, 'metadata' | 'spec'> & {
  metadata: ObjectMeta & { namespace: string }
  spec: BaseModelSpec
}

// Union type for both model types
export type Model = ClusterBaseModel | BaseModel

// Type guard to check if model is namespace-scoped
export function isNamespaceScoped(model: Model): model is BaseModel {
  return 'namespace' in model.metadata && model.metadata.namespace !== undefined
}

// HuggingFace types
export interface HuggingFaceModelSearchResult {
  id: string
  modelId: string
  author: string
  sha: string
  lastModified: string
  private: boolean
  gated: boolean
  disabled: boolean
  downloads: number
  likes: number
  tags: string[]
  pipeline_tag?: string
  library_name?: string
}

export interface HuggingFaceFileSibling {
  rfilename: string
  size?: number
}

export interface HuggingFaceModelInfo {
  id: string
  modelId: string
  author: string
  sha: string
  lastModified: string
  private: boolean
  gated: boolean
  disabled: boolean
  downloads: number
  likes: number
  tags: string[]
  pipeline_tag?: string
  library_name?: string
  siblings?: HuggingFaceFileSibling[]
  config?: HuggingFaceModelConfig
  cardData?: HuggingFaceCardData
}

export interface HuggingFaceCardData {
  license?: string
  language?: string | string[]
  tags?: string[]
  datasets?: string[]
  library_name?: string
  pipeline_tag?: string
  base_model?: string
}

export interface HuggingFaceModelConfig {
  architectures?: string[]
  model_type?: string
  task_specific_params?: Record<string, unknown>
  max_position_embeddings?: number
  vocab_size?: number
  hidden_size?: number
  num_hidden_layers?: number
  num_attention_heads?: number
  torch_dtype?: string
  quantization_config?: QuantizationConfig
}

export interface QuantizationConfig {
  quant_method?: string
  bits?: number
  group_size?: number
  desc_act?: boolean
  sym?: boolean
  checkpoint_format?: string
}

export interface HuggingFaceModelInfoResponse {
  model: HuggingFaceModelInfo
  detectedFormat?: string
  estimatedSize?: number
}

export interface HuggingFaceSearchParams {
  q?: string
  author?: string
  filter?: string
  sort?: 'downloads' | 'likes' | 'lastModified'
  direction?: 'asc' | 'desc'
  limit?: number
  tags?: string[]
}

// Model scope enum
export enum ModelScope {
  Cluster = 'cluster',
  Namespace = 'namespace',
}

// Create model form data
export interface CreateModelFormData {
  scope: ModelScope
  namespace?: string // Required when scope is Namespace
  name: string
  spec: BaseModelSpec
}

// Model event from K8s
export interface ModelEvent {
  type: 'Normal' | 'Warning'
  reason: string // e.g., DownloadProgress, FinalizerAdded
  message: string
  count: number
  firstTimestamp: string
  lastTimestamp: string
  source: string
}

// Parsed download progress from event message
export interface DownloadProgress {
  node: string
  percentage: number
  completedBytes: number
  totalBytes: number
  speedBytesPerSec: number
  eta?: string
}

// Helper to parse download progress from event message
export function parseDownloadProgress(message: string): DownloadProgress | null {
  // Format: "[10.0.119.255] Download progress: 42.3% (17.3 GB/40.9 GB) at 24.8 MB/s, ETA: 16m 13s"
  const regex =
    /\[([^\]]+)\] Download progress: ([\d.]+)% \(([\d.]+ [A-Z]+)\/([\d.]+ [A-Z]+)\) at ([\d.]+ [A-Z]+\/s)(?:, ETA: (.+))?/
  const match = message.match(regex)
  if (!match) return null

  const parseBytes = (str: string): number => {
    const [value, unit] = str.split(' ')
    const num = parseFloat(value)
    switch (unit) {
      case 'B':
        return num
      case 'KB':
        return num * 1024
      case 'MB':
        return num * 1024 * 1024
      case 'GB':
        return num * 1024 * 1024 * 1024
      case 'TB':
        return num * 1024 * 1024 * 1024 * 1024
      default:
        return num
    }
  }

  const parseSpeed = (str: string): number => {
    const speedStr = str.replace('/s', '')
    return parseBytes(speedStr)
  }

  return {
    node: match[1],
    percentage: parseFloat(match[2]),
    completedBytes: parseBytes(match[3]),
    totalBytes: parseBytes(match[4]),
    speedBytesPerSec: parseSpeed(match[5]),
    eta: match[6] || undefined,
  }
}
