'use client'

import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { Button } from '@/components/ui/Button'
import { YamlEditor } from '@/components/editor/YamlEditor'
import { useServiceFormContext } from './ServiceFormContext'
import { buildInferenceService, type BuildOptions } from './buildInferenceService'
import { serviceToYaml, withRolloutSkeleton } from './serviceYaml'

/**
 * The YAML tab: the form's object until the text is edited, then the edited text, which is
 * what gets submitted until the user regenerates it from the form.
 */
export function YamlTab({ buildOptions }: { buildOptions: BuildOptions }) {
  const { control } = useFormContext<ServiceFormValues>()
  const { yamlDraft, setYamlDraft } = useServiceFormContext()
  const values = useWatch({ control }) as unknown as ServiceFormValues

  const generated = useMemo(() => {
    try {
      return serviceToYaml(buildInferenceService(values, buildOptions))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return `# The form values cannot be rendered: ${reason}\n`
    }
  }, [values, buildOptions])

  const text = yamlDraft ?? generated

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">YAML</h3>
          <p className="text-sm text-muted-foreground">
            {yamlDraft === null
              ? 'Generated from the form. Editing it makes this text the source of truth: '
              : 'Edited. This text is what will be submitted: '}
            overlays, rollout, traffic and placement are configured here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {yamlDraft !== null && (
            <Button type="button" size="sm" variant="outline" onClick={() => setYamlDraft(null)}>
              Regenerate from form
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setYamlDraft(withRolloutSkeleton(text))}
          >
            Insert rollout skeleton
          </Button>
        </div>
      </div>
      <YamlEditor
        value={text}
        onChange={setYamlDraft}
        height="560px"
        aria-label="InferenceService YAML"
      />
    </div>
  )
}
