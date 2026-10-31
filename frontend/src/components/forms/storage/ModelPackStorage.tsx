'use client'

import { FormInput } from '../FormField'
import { helpTextClassName } from '../styles'

interface ModelPackStorageProps {
  registry: string
  repository: string
  /** A tag (v1) or a digest (sha256:...); empty pulls the registry's default tag. */
  reference: string
  onRegistryChange: (value: string) => void
  onRepositoryChange: (value: string) => void
  onReferenceChange: (value: string) => void
}

/** Fields for modelpack://{registry}/{repository}[:{tag}|@{digest}], a CNCF ModelPack artifact. */
export function ModelPackStorage({
  registry,
  repository,
  reference,
  onRegistryChange,
  onRepositoryChange,
  onReferenceChange,
}: ModelPackStorageProps) {
  return (
    <>
      <FormInput
        label="Registry"
        required
        value={registry}
        onChange={(e) => onRegistryChange(e.target.value)}
        placeholder="ghcr.io"
        helpText="Registry host, with its port if it needs one (registry.example.com:5000)"
      />
      <FormInput
        label="Repository"
        required
        value={repository}
        onChange={(e) => onRepositoryChange(e.target.value)}
        placeholder="myorg/llama-3-70b"
        helpText="Repository in the registry; it can contain slashes"
      />
      <FormInput
        label="Tag or Digest"
        value={reference}
        onChange={(e) => onReferenceChange(e.target.value)}
        placeholder="v1"
        helpText="A tag such as v1, or a digest such as sha256:... Optional: empty pulls the registry's default tag"
      />
      <p className={helpTextClassName}>
        The model agent pulls the artifact through an <code>llmman serve</code> daemon that you run
        on each selected node. The daemon holds the registry credentials; the model&apos;s{' '}
        <code>storage.key</code> and <code>parameters</code> play no role.
      </p>
    </>
  )
}
