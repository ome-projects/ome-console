'use client'

import { Controller } from 'react-hook-form'
import { useFieldError, useRuntimeFormContext, useRuntimeScope } from '../RuntimeFormContext'
import { CollapsibleSection } from '../../CollapsibleSection'
import { ContainerForm } from '../../ContainerForm'
import { VolumeForm } from '../../VolumeForm'
import { ComponentExtensionFields } from '../../shared/ComponentExtensionFields'
import { ContainerListSection, JsonMapField } from '../components'
import type { JsonMapValue } from '../components/JsonMapField'
import { helpTextClassName, errorClassName } from '../../styles'

const CONFIG_PATH = 'spec.routerConfig.config'

/**
 * Router configuration section for RuntimeForm.
 * Handles request routing and load balancing configuration.
 */
export function RouterConfigSection() {
  const { form } = useRuntimeFormContext()
  const { register, control } = form
  const { namespace } = useRuntimeScope()
  const fieldError = useFieldError()
  const configError = fieldError(CONFIG_PATH)

  return (
    <CollapsibleSection
      title="Router Configuration"
      description="Configure the router component for request routing and load balancing"
    >
      <div className="space-y-8">
        {/* Replicas and autoscaler */}
        <ComponentExtensionFields basePath="spec.routerConfig" namespace={namespace} />

        {/* Runner (Main Container) */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">Runner (Main Container)</h3>
          <ContainerForm
            basePath="spec.routerConfig.runner"
            register={register}
            control={control}
          />
        </div>

        {/* Router Configuration Parameters */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">
            Router Configuration Parameters
          </h3>
          <label htmlFor={CONFIG_PATH} className={`${helpTextClassName} mb-2 block`}>
            Additional configuration parameters as key-value pairs (a JSON object of strings)
          </label>
          <Controller
            control={control}
            name={CONFIG_PATH}
            render={({ field }) => (
              <JsonMapField
                id={CONFIG_PATH}
                value={field.value as JsonMapValue}
                onChange={field.onChange}
                error={!!configError}
                placeholder={'{\n  "timeout": "30s",\n  "maxConnections": "1000"\n}'}
              />
            )}
          />
          {configError && <p className={errorClassName}>{configError}</p>}
        </div>

        {/* Volumes */}
        <VolumeForm basePath="spec.routerConfig.volumes" register={register} control={control} />

        {/* Init Containers */}
        <ContainerListSection
          title="Init Containers"
          description="Containers that run before the main container starts"
          basePath="spec.routerConfig.initContainers"
          register={register}
          control={control}
          addButtonText="+ Add Init Container"
          emptyText="No init containers defined"
        />

        {/* Sidecar Containers */}
        <ContainerListSection
          title="Sidecar Containers"
          description="Containers that run alongside the main container"
          basePath="spec.routerConfig.sidecars"
          register={register}
          control={control}
          addButtonText="+ Add Sidecar"
          emptyText="No sidecar containers defined"
        />
      </div>
    </CollapsibleSection>
  )
}
