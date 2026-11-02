'use client'

import { useFormContext } from 'react-hook-form'
import { DeploymentModes } from '@/lib/types/service'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { CollapsibleSection } from '../../CollapsibleSection'
import { FormSelect } from '../../FormSelect'

const MODE_LABELS: Record<string, string> = {
  OMENative: 'OMENative (lifecycle-managed instances, rollouts, multi-node)',
  RawDeployment: 'RawDeployment (Kubernetes Deployment and HPA)',
}

/** `spec.deploymentMode`, which drives every component unless a component annotation overrides it. */
export function DeploymentSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ServiceFormValues>()

  return (
    <CollapsibleSection title="Deployment" defaultOpen>
      <FormSelect
        label="Deployment mode"
        className="max-w-xl"
        options={[
          { value: '', label: 'Cluster default' },
          ...DeploymentModes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] ?? mode })),
        ]}
        error={errors.deploymentMode?.message}
        helpText="Lifecycle settings and rollout groups apply only to OMENative components; a per-component ome.io/deploymentMode annotation still wins"
        {...register('deploymentMode')}
      />
    </CollapsibleSection>
  )
}
