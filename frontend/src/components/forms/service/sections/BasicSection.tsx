'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { useNamespaces } from '@/lib/hooks/useNamespaces'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { CollapsibleSection } from '../../CollapsibleSection'
import { FormInput } from '../../FormInput'
import { FormSelect } from '../../FormSelect'
import { gridStyles } from '../../styles'
import { useServiceFormContext } from '../ServiceFormContext'
import { DEFAULT_NAMESPACE } from '../serviceFormValues'

/** Name and namespace; both are fixed once the service exists. */
export function BasicSection() {
  const { isEditMode } = useServiceFormContext()
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ServiceFormValues>()
  const namespace = useWatch({ control, name: 'metadata.namespace' })
  const { data: namespaces } = useNamespaces()

  const names = new Set([DEFAULT_NAMESPACE, ...(namespaces?.items ?? [])])
  if (namespace) names.add(namespace)
  const options = Array.from(names).map((name) => ({ value: name, label: name }))

  return (
    <CollapsibleSection title="Basic Information" defaultOpen>
      <div className={gridStyles.cols2}>
        <FormInput
          label="Service name"
          required
          mono
          placeholder="my-inference-service"
          disabled={isEditMode}
          error={errors.metadata?.name?.message}
          helpText={isEditMode ? 'The name cannot be changed after creation' : undefined}
          {...register('metadata.name')}
        />
        <FormSelect
          label="Namespace"
          required
          options={options}
          disabled={isEditMode}
          error={errors.metadata?.namespace?.message}
          helpText={isEditMode ? 'The namespace cannot be changed' : undefined}
          {...register('metadata.namespace')}
        />
      </div>
    </CollapsibleSection>
  )
}
