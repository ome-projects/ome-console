'use client'

import { useFormContext } from 'react-hook-form'
import { useAccelerators } from '@/lib/hooks/useAccelerators'
import {
  LifecycleSpecRestartPolicyValues,
  MigrationPolicyModeValues,
  UpdateStrategyTypeValues,
} from '@/lib/types/generated/ome.v1beta1'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { CollapsibleSection } from '../../CollapsibleSection'
import { FormInput } from '../../FormInput'
import { FormSelect } from '../../FormSelect'
import { gridStyles } from '../../styles'
import { optionalNumber } from '../../shared/fields'

const withUnset = (values: readonly string[], unsetLabel: string) => [
  { value: '', label: unsetLabel },
  ...values.map((value) => ({ value, label: value })),
]

/**
 * TTL, accelerator class and the OMENative lifecycle, which the builder writes to every enabled
 * component. Overlays, rollout, traffic and placement are edited in the YAML tab.
 */
export function AdvancedSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ServiceFormValues>()
  const { data: accelerators } = useAccelerators()
  const lifecycleErrors = errors.advanced?.lifecycle

  return (
    <CollapsibleSection
      title="Advanced"
      description="TTL, accelerator class and lifecycle; overlays, rollout, traffic and placement live in the YAML tab"
    >
      <div className="space-y-8">
        <div className={gridStyles.cols2}>
          <FormInput
            label="TTL after creation (seconds)"
            type="number"
            min={1}
            step={1}
            mono
            placeholder="Lives until deleted"
            error={errors.advanced?.ttlSecondsAfterCreation?.message}
            helpText="The controller deletes the service this long after its creation"
            {...register('advanced.ttlSecondsAfterCreation', optionalNumber)}
          />
          <FormSelect
            label="Accelerator class"
            options={[
              { value: '', label: 'Any' },
              ...(accelerators?.items ?? []).map((a) => ({
                value: a.metadata.name,
                label: a.metadata.name,
              })),
            ]}
            helpText="spec.acceleratorSelector.acceleratorClass; runtimes must list it in their accelerator requirements"
            {...register('advanced.acceleratorClass')}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Lifecycle (OMENative)</h4>
          <p className="mb-4 text-xs text-muted-foreground">
            Written to every enabled component; ignored unless the component resolves to
            deploymentMode OMENative. Unset fields inherit the runtime&apos;s values.
          </p>
          <div className={gridStyles.cols2}>
            <FormSelect
              label="Update strategy"
              options={withUnset(UpdateStrategyTypeValues, 'Inherit (SurgeThenDrain by default)')}
              error={lifecycleErrors?.updateStrategyType?.message}
              {...register('advanced.lifecycle.updateStrategyType')}
            />
            <FormInput
              label="Min ready seconds"
              type="number"
              min={0}
              step={1}
              mono
              placeholder="Inherit"
              error={lifecycleErrors?.minReadySeconds?.message}
              helpText="How long a new pod must stay Ready before it counts as Available"
              {...register('advanced.lifecycle.minReadySeconds', optionalNumber)}
            />
            <FormSelect
              label="Restart policy"
              options={withUnset(LifecycleSpecRestartPolicyValues, 'Inherit')}
              error={lifecycleErrors?.restartPolicy?.message}
              helpText="Whether a failed pod recreates the whole instance"
              {...register('advanced.lifecycle.restartPolicy')}
            />
            <FormSelect
              label="Migration policy"
              options={withUnset(MigrationPolicyModeValues, 'Inherit (Auto by default)')}
              error={lifecycleErrors?.migrationPolicyMode?.message}
              helpText="Never disables relocation and migration requests"
              {...register('advanced.lifecycle.migrationPolicyMode')}
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
