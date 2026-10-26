'use client'

import { createContext, useContext, ReactNode, useState } from 'react'
import { useWatch, type Path, type UseFormReturn } from 'react-hook-form'
import type { RuntimeFormValues, RuntimeKind } from '@/lib/validation/runtime-schema'

interface RuntimeFormContextValue {
  /** Whether the form is in edit mode (vs create mode) */
  isEditMode: boolean
  /** Form methods from react-hook-form */
  form: UseFormReturn<RuntimeFormValues>
  /** Whether engine multi-node is enabled */
  engineMultiNode: boolean
  /** Toggle engine multi-node */
  setEngineMultiNode: (enabled: boolean) => void
  /** Whether decoder multi-node is enabled */
  decoderMultiNode: boolean
  /** Toggle decoder multi-node */
  setDecoderMultiNode: (enabled: boolean) => void
}

const RuntimeFormContext = createContext<RuntimeFormContextValue | null>(null)

interface RuntimeFormProviderProps {
  children: ReactNode
  form: UseFormReturn<RuntimeFormValues>
  isEditMode: boolean
  initialEngineMultiNode?: boolean
  initialDecoderMultiNode?: boolean
}

/**
 * Provider component that shares form state across all RuntimeForm sections.
 * This avoids prop drilling and makes sections more self-contained.
 */
export function RuntimeFormProvider({
  children,
  form,
  isEditMode,
  initialEngineMultiNode = false,
  initialDecoderMultiNode = false,
}: RuntimeFormProviderProps) {
  const [engineMultiNode, setEngineMultiNode] = useState(initialEngineMultiNode)
  const [decoderMultiNode, setDecoderMultiNode] = useState(initialDecoderMultiNode)

  return (
    <RuntimeFormContext.Provider
      value={{
        isEditMode,
        form,
        engineMultiNode,
        setEngineMultiNode,
        decoderMultiNode,
        setDecoderMultiNode,
      }}
    >
      {children}
    </RuntimeFormContext.Provider>
  )
}

/**
 * Hook to access RuntimeForm context in section components.
 * Must be used within a RuntimeFormProvider.
 */
export function useRuntimeFormContext() {
  const context = useContext(RuntimeFormContext)
  if (!context) {
    throw new Error('useRuntimeFormContext must be used within a RuntimeFormProvider')
  }
  return context
}

/** The scope the form is writing: the kind, and the namespace only for a ServingRuntime. */
export function useRuntimeScope(): { kind: RuntimeKind; namespace?: string } {
  const { form } = useRuntimeFormContext()
  const kind = useWatch({ control: form.control, name: 'kind' })
  const namespace = useWatch({ control: form.control, name: 'metadata.namespace' })
  return { kind, namespace: kind === 'ServingRuntime' && namespace ? namespace : undefined }
}

/** The error message of a field addressed by a runtime path, e.g. `spec.modelSizeRange.min`. */
export function useFieldError(): (path: string) => string | undefined {
  const { form } = useRuntimeFormContext()
  return (path) =>
    form.getFieldState(path as Path<RuntimeFormValues>, form.formState).error?.message
}
