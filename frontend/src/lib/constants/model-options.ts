/**
 * Shared options for model format and framework dropdowns
 * Used by both model creation and edit pages
 */

import {
  DownloadPolicies,
  ModelDistributions,
  type DownloadPolicy,
  type ModelDistribution,
} from '@/lib/types/model'

export const MODEL_FORMAT_OPTIONS = [
  { value: '', label: 'Select format...' },
  { value: 'safetensors', label: 'SafeTensors' },
  { value: 'pytorch', label: 'PyTorch' },
  { value: 'gguf', label: 'GGUF' },
  { value: 'ggml', label: 'GGML' },
  { value: 'onnx', label: 'ONNX' },
  { value: 'tensorflow', label: 'TensorFlow' },
  { value: 'huggingface', label: 'HuggingFace' },
] as const

export const MODEL_FRAMEWORK_OPTIONS = [
  { value: '', label: 'Select framework...' },
  { value: 'transformers', label: 'Transformers' },
  { value: 'pytorch', label: 'PyTorch' },
  { value: 'tensorflow', label: 'TensorFlow' },
  { value: 'jax', label: 'JAX' },
  { value: 'onnx-runtime', label: 'ONNX Runtime' },
  { value: 'llama-cpp', label: 'llama.cpp' },
] as const

export type ModelFormatValue = (typeof MODEL_FORMAT_OPTIONS)[number]['value']
export type ModelFrameworkValue = (typeof MODEL_FRAMEWORK_OPTIONS)[number]['value']

// `spec.distribution` and `spec.storage.downloadPolicy` (since OME v1.3). The '' option leaves
// the field out, which OME reads as the default. Labels and help follow the OME doc comments.

const DISTRIBUTION_LABELS: Record<ModelDistribution, string> = {
  PerNode: 'PerNode - a full copy on each selected node',
  Sharded: 'Sharded - through an external cache (in development)',
}

export const MODEL_DISTRIBUTION_OPTIONS = [
  { value: '', label: 'Default (PerNode)' },
  ...ModelDistributions.map((value) => ({ value, label: DISTRIBUTION_LABELS[value] })),
]

export const MODEL_DISTRIBUTION_HELP =
  "PerNode, the default, puts a full copy on each selected node. Sharded is for loading the model through an external cache that holds it in chunks across the cluster; it is in development, so a Sharded model can't be served yet, and pvc:// models can't use it."

const DOWNLOAD_POLICY_LABELS: Record<DownloadPolicy, string> = {
  AlwaysDownload: 'AlwaysDownload - one copy per model',
  ReuseIfExists: 'ReuseIfExists - share Hugging Face files between models',
}

export const DOWNLOAD_POLICY_OPTIONS = [
  { value: '', label: 'Default (AlwaysDownload)' },
  ...DownloadPolicies.map((value) => ({ value, label: DOWNLOAD_POLICY_LABELS[value] })),
]

export const DOWNLOAD_POLICY_HELP =
  'AlwaysDownload, the default, keeps a copy of the files per model. ReuseIfExists lets the model agent reuse Hugging Face files that another model already downloaded to the node; models from other sources ignore it.'
