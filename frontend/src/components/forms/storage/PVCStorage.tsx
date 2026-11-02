'use client'

import { FormInput } from '../FormField'

interface PVCStorageProps {
  /**
   * A ClusterBaseModel names the claim's namespace, pvc://{namespace}:{pvc-name}/{sub-path};
   * a BaseModel uses a claim in its own namespace, pvc://{pvc-name}/{sub-path}.
   */
  clusterScoped: boolean
  /** The claim's namespace; only read for a cluster-scoped model. */
  namespace: string
  name: string
  subPath: string
  onNamespaceChange: (value: string) => void
  onNameChange: (value: string) => void
  onSubPathChange: (value: string) => void
  /** The namespace of a namespaced model, shown as help for the claim. */
  modelNamespace?: string
}

export function PVCStorage({
  clusterScoped,
  namespace,
  name,
  subPath,
  onNamespaceChange,
  onNameChange,
  onSubPathChange,
  modelNamespace,
}: PVCStorageProps) {
  return (
    <>
      {clusterScoped && (
        <FormInput
          label="PVC Namespace"
          required
          value={namespace}
          onChange={(e) => onNamespaceChange(e.target.value)}
          placeholder="llama-demo"
          helpText="Namespace of the claim. Only InferenceServices in this namespace can mount it"
        />
      )}
      <FormInput
        label="PVC Name"
        required
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="model-storage"
        helpText={
          clusterScoped
            ? undefined
            : `A claim in the model's namespace${modelNamespace ? ` (${modelNamespace})` : ''}`
        }
      />
      <FormInput
        label="Sub-path"
        required
        value={subPath}
        onChange={(e) => onSubPathChange(e.target.value)}
        placeholder="models/my-model"
        helpText="Path from the volume root to the directory that holds config.json (model_index.json for a diffusion model)"
      />
    </>
  )
}
