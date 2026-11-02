'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { InferenceService } from '@/lib/types/service'

export type ServiceFormMode = 'create' | 'edit'
export type ServiceFormTab = 'form' | 'yaml'

export interface ServiceFormContextValue {
  mode: ServiceFormMode
  isEditMode: boolean
  /** The stored object in edit mode. */
  initialData?: InferenceService
  activeTab: ServiceFormTab
  setActiveTab: (tab: ServiceFormTab) => void
  /** The YAML as the user edited it, or null while the form generates it. */
  yamlDraft: string | null
  setYamlDraft: (yaml: string | null) => void
}

const ServiceFormContext = createContext<ServiceFormContextValue | null>(null)

/** Shares the form's mode and the form/YAML state with the sections; form methods come from react-hook-form's FormProvider. */
export function ServiceFormProvider({
  value,
  children,
}: {
  value: ServiceFormContextValue
  children: ReactNode
}) {
  return <ServiceFormContext.Provider value={value}>{children}</ServiceFormContext.Provider>
}

export function useServiceFormContext(): ServiceFormContextValue {
  const context = useContext(ServiceFormContext)
  if (!context) {
    throw new Error('useServiceFormContext must be used within a ServiceFormProvider')
  }
  return context
}
