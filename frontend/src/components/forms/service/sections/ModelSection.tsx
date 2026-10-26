'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import { clsx } from 'clsx'
import { useModels } from '@/lib/hooks/useModels'
import { useCapability } from '@/lib/hooks/useCapabilities'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CollapsibleSection } from '../../CollapsibleSection'
import { FormSelect } from '../../FormSelect'
import { FormTextarea } from '../../FormTextarea'
import { checkboxStyles } from '../../styles'
import { DEFAULT_NAMESPACE } from '../serviceFormValues'

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * The model to serve: a ClusterBaseModel (written as `spec.model.name`) or a BaseModel of the
 * service's namespace (also `kind: BaseModel`), plus FineTunedWeights when the cluster has them.
 */
export function ModelSection() {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ServiceFormValues>()
  const namespace = useWatch({ control, name: 'metadata.namespace' }) || DEFAULT_NAMESPACE
  const scope = useWatch({ control, name: 'model.scope' })
  const modelName = useWatch({ control, name: 'model.name' })

  const clusterModels = useModels()
  const namespaceModels = useModels(namespace)
  const fineTunedWeights = useCapability({ feature: 'fineTunedWeights' })

  const models = scope === 'namespace' ? namespaceModels : clusterModels
  const items = models.data?.items ?? []
  const selected = items.find((model) => model.metadata.name === modelName)

  const options = [
    { value: '', label: models.isLoading ? 'Loading models...' : 'No model (runtime only)' },
    ...items.map((model) => ({
      value: model.metadata.name,
      label: `${model.metadata.name} (${model.spec.modelFormat?.name ?? 'unknown format'})`,
    })),
  ]

  return (
    <CollapsibleSection
      title="Model"
      description="The runtime ranking below follows the selected model"
      defaultOpen
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="text-sm font-medium text-foreground mb-2">Model scope</legend>
          <div className="flex flex-wrap gap-6">
            <label className={checkboxStyles.container}>
              <input
                type="radio"
                value="cluster"
                className={checkboxStyles.input}
                {...register('model.scope', { onChange: () => setValue('model.name', '') })}
              />
              <span className={checkboxStyles.label}>Cluster model (ClusterBaseModel)</span>
            </label>
            <label className={checkboxStyles.container}>
              <input
                type="radio"
                value="namespace"
                className={checkboxStyles.input}
                {...register('model.scope', { onChange: () => setValue('model.name', '') })}
              />
              <span className={checkboxStyles.label}>
                Namespaced model (BaseModel in {namespace})
              </span>
            </label>
          </div>
        </fieldset>

        <FormSelect
          label="Model"
          options={options}
          error={errors.model?.name?.message}
          helpText={
            models.isError
              ? 'The model list could not be loaded'
              : scope === 'namespace'
                ? `BaseModels in ${namespace}`
                : 'ClusterBaseModels; a service without a model needs an explicit runtime'
          }
          {...register('model.name')}
        />

        {selected && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="font-medium text-foreground">{selected.metadata.name}</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.spec.modelFormat?.name && (
                <Chip className="bg-primary/10 text-primary">
                  Format: {selected.spec.modelFormat.name}
                  {selected.spec.modelFormat.version ? ` ${selected.spec.modelFormat.version}` : ''}
                </Chip>
              )}
              {selected.spec.modelFramework?.name && (
                <Chip className="bg-accent/10 text-accent">
                  Framework: {selected.spec.modelFramework.name}
                </Chip>
              )}
              {selected.spec.modelParameterSize && (
                <Chip className="bg-muted text-muted-foreground">
                  Size: {selected.spec.modelParameterSize}
                </Chip>
              )}
              {selected.status?.state && <StatusBadge state={selected.status.state} size="sm" />}
            </div>
          </div>
        )}

        {fineTunedWeights.available && (
          <FormTextarea
            label="Fine-tuned weights"
            mono
            rows={2}
            placeholder="my-lora-adapter"
            helpText="FineTunedWeight names to apply to the base model, one per line"
            {...register('model.fineTunedWeights')}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}
