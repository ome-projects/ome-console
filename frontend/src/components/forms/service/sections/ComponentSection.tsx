'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { CollapsibleSection } from '../../CollapsibleSection'
import { checkboxStyles } from '../../styles'
import { ComponentExtensionFields } from '../../shared/ComponentExtensionFields'
import { defaultComponentExtensionFormValues } from '../../shared/componentExtension'
import { DEFAULT_NAMESPACE } from '../serviceFormValues'

export interface ComponentSectionProps {
  component: 'engine' | 'decoder' | 'router'
  title: string
  description: string
  /** Decoder and router are opt-in; the engine always exists. */
  optional?: boolean
  defaultOpen?: boolean
}

/** One component's replica bounds and autoscaler; optional components carry an enable toggle. */
export function ComponentSection({
  component,
  title,
  description,
  optional = false,
  defaultOpen = false,
}: ComponentSectionProps) {
  const { control, setValue } = useFormContext<ServiceFormValues>()
  const namespace = useWatch({ control, name: 'metadata.namespace' }) || DEFAULT_NAMESPACE
  const enabledPath = `${component}.enabled` as 'decoder.enabled' | 'router.enabled'
  const enabledValue = useWatch({ control, name: enabledPath })
  const enabled = !optional || enabledValue === true

  const toggle = (next: boolean) => {
    if (component === 'engine') return
    if (next) {
      setValue(enabledPath, true, { shouldDirty: true })
    } else {
      // Dropping the component also clears its fields, so nothing hidden can fail validation.
      setValue(
        component,
        { ...defaultComponentExtensionFormValues(), enabled: false },
        { shouldDirty: true }
      )
    }
  }

  return (
    <CollapsibleSection
      title={title}
      description={description}
      defaultOpen={defaultOpen}
      badge={
        optional ? (
          <span
            className={
              enabled
                ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
            }
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {optional && (
          <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => toggle(event.target.checked)}
              className={checkboxStyles.input}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Enable {component}</span>
              <span className="block text-xs text-muted-foreground">
                Writes spec.{component}; the runtime&apos;s {component}Config supplies the
                containers
              </span>
            </span>
          </label>
        )}
        {enabled && <ComponentExtensionFields basePath={component} namespace={namespace} />}
      </div>
    </CollapsibleSection>
  )
}
