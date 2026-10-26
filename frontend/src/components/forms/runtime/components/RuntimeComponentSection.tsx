'use client'

import { UseFormRegister, Control, useFormContext } from 'react-hook-form'
import { CollapsibleSection } from '../../CollapsibleSection'
import { ContainerForm } from '../../ContainerForm'
import { VolumeForm } from '../../VolumeForm'
import { ComponentExtensionFields } from '../../shared/ComponentExtensionFields'
import { useRuntimeScope } from '../RuntimeFormContext'
import { MultiNodeConfig } from './MultiNodeConfig'
import { ContainerListSection } from './ContainerListSection'

interface RuntimeComponentSectionProps {
  /** Title for the collapsible section */
  title: string
  /** Description shown below the title */
  description: string
  /** Base path for form fields (e.g., 'spec.engineConfig' or 'spec.decoderConfig') */
  basePath: string
  /** Form register function from react-hook-form */
  register: UseFormRegister<any>
  /** Form control from react-hook-form */
  control: Control<any>
  /** Whether multi-node deployment is enabled */
  multiNodeEnabled: boolean
  /** Callback when multi-node toggle changes */
  onMultiNodeToggle: (enabled: boolean) => void
  /** Description for leader node configuration */
  leaderDescription: string
  /** Description for worker node configuration */
  workerDescription: string
}

/**
 * Reusable section component for runtime configurations (Engine/Decoder).
 * Eliminates duplication between EngineConfigSection and DecoderConfigSection.
 *
 * Includes:
 * - Replica bounds and the autoscaler block (shared with the InferenceService form)
 * - Multi-node toggle and configuration (Leader/Worker)
 * - Single-node Runner configuration (when multi-node disabled)
 * - Volumes
 * - Init containers
 * - Sidecar containers
 */
export function RuntimeComponentSection({
  title,
  description,
  basePath,
  register,
  control,
  multiNodeEnabled,
  onMultiNodeToggle,
  leaderDescription,
  workerDescription,
}: RuntimeComponentSectionProps) {
  const { setValue } = useFormContext()
  const { namespace } = useRuntimeScope()

  const toggleMultiNode = (enabled: boolean) => {
    onMultiNodeToggle(enabled)
    if (!enabled) {
      // The leader and worker inputs unmount; their values would otherwise be submitted unseen.
      setValue(`${basePath}.leader`, undefined, { shouldDirty: true })
      setValue(`${basePath}.worker`, undefined, { shouldDirty: true })
    }
  }

  return (
    <CollapsibleSection title={title} description={description}>
      <div className="space-y-8">
        {/* Replicas and autoscaler */}
        <ComponentExtensionFields basePath={basePath} namespace={namespace} />

        {/* Multi-Node Configuration - placed before Runner so toggle is visible first */}
        <MultiNodeConfig
          basePath={basePath}
          register={register}
          control={control}
          enabled={multiNodeEnabled}
          onToggle={toggleMultiNode}
          leaderDescription={leaderDescription}
          workerDescription={workerDescription}
        />

        {/* Runner (Main Container) - only shown when NOT using multi-node */}
        {!multiNodeEnabled && (
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4">
              Runner (Main Container)
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Single-node deployment container configuration
            </p>
            <ContainerForm basePath={`${basePath}.runner`} register={register} control={control} />
          </div>
        )}

        {/* Volumes */}
        <VolumeForm basePath={`${basePath}.volumes`} register={register} control={control} />

        {/* Init Containers */}
        <ContainerListSection
          title="Init Containers"
          description="Containers that run before the main container starts"
          basePath={`${basePath}.initContainers`}
          register={register}
          control={control}
          addButtonText="+ Add Init Container"
          emptyText="No init containers defined"
        />

        {/* Sidecar Containers */}
        <ContainerListSection
          title="Sidecar Containers"
          description="Containers that run alongside the main container"
          basePath={`${basePath}.sidecars`}
          register={register}
          control={control}
          addButtonText="+ Add Sidecar"
          emptyText="No sidecar containers defined"
        />
      </div>
    </CollapsibleSection>
  )
}
