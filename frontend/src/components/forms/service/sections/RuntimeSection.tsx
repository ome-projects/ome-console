'use client'

import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { clsx } from 'clsx'
import { useRuntimeExplain, useRuntimes } from '@/lib/hooks/useRuntimes'
import type { Runtime, RuntimeCandidate, RuntimeExplainRequest } from '@/lib/types/runtime'
import type { ServiceFormValues } from '@/lib/validation/service-schema'
import { Spinner } from '@/components/ui/Spinner'
import { CollapsibleSection } from '../../CollapsibleSection'
import { checkboxStyles, errorClassName, helpTextClassName } from '../../styles'
import { DEFAULT_NAMESPACE } from '../serviceFormValues'

/** Unranked candidates from plain runtime lists, for a backend without `/runtimes/explain`. */
function unrankedCandidates(cluster: Runtime[], namespaced: Runtime[]): RuntimeCandidate[] {
  const toCandidate = (runtime: Runtime, kind: RuntimeCandidate['runtime']['kind']) => ({
    runtime: { name: runtime.metadata.name, kind, namespace: runtime.metadata.namespace },
    compatible: true,
    autoSelect: false,
    score: 0,
    reasons: [],
  })
  return [
    ...namespaced.map((r) => toCandidate(r, 'ServingRuntime')),
    ...cluster.map((r) => toCandidate(r, 'ClusterServingRuntime')),
  ]
}

function CandidateCard({
  candidate,
  selected,
  ranked,
  onSelect,
}: {
  candidate: RuntimeCandidate
  selected: boolean
  ranked: boolean
  onSelect: () => void
}) {
  const { runtime, compatible } = candidate
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!compatible}
      onClick={onSelect}
      className={clsx(
        'w-full rounded-xl border-2 p-4 text-left transition-all duration-150',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/30 hover:bg-muted/30',
        !compatible && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">{runtime.name}</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {runtime.kind === 'ServingRuntime'
                ? `namespace ${runtime.namespace ?? ''}`
                : 'cluster'}
            </span>
            {candidate.autoSelect && compatible && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                auto-select eligible
              </span>
            )}
          </div>
          {candidate.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {candidate.reasons.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center rounded-md bg-success/10 px-2 py-0.5 text-xs text-success"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
          {!compatible && (
            <p className="mt-2 text-xs text-warning">{candidate.exclusion ?? 'Not compatible'}</p>
          )}
        </div>
        {ranked && compatible && (
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            score {candidate.score}
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Auto-select (no `spec.runtime`) or one runtime from the explain ranking: compatible ones
 * first with their score and reasons, incompatible ones disabled with their exclusion. A
 * namespaced pick writes `kind: ServingRuntime`; a cluster pick writes the name only.
 */
export function RuntimeSection() {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ServiceFormValues>()
  const namespace = useWatch({ control, name: 'metadata.namespace' }) || DEFAULT_NAMESPACE
  const modelScope = useWatch({ control, name: 'model.scope' })
  const modelName = useWatch({ control, name: 'model.name' })
  const acceleratorClass = useWatch({ control, name: 'advanced.acceleratorClass' })
  const deploymentMode = useWatch({ control, name: 'deploymentMode' })
  const runtimeMode = useWatch({ control, name: 'runtime.mode' })
  const runtimeName = useWatch({ control, name: 'runtime.name' })
  const runtimeKind = useWatch({ control, name: 'runtime.kind' })

  const request = useMemo<RuntimeExplainRequest | undefined>(() => {
    if (!modelName) return undefined
    return {
      namespace,
      model: {
        name: modelName,
        kind: modelScope === 'namespace' ? 'BaseModel' : 'ClusterBaseModel',
      },
      acceleratorClasses: acceleratorClass ? [acceleratorClass] : undefined,
      deploymentMode: deploymentMode || undefined,
    }
  }, [namespace, modelScope, modelName, acceleratorClass, deploymentMode])

  const explain = useRuntimeExplain(request)
  const clusterRuntimes = useRuntimes()
  const namespacedRuntimes = useRuntimes(namespace)

  const ranked = !!explain.data
  const candidates = useMemo(() => {
    if (explain.data) {
      // Keep the backend's order, incompatible runtimes last.
      return [...explain.data.items].sort((a, b) => Number(b.compatible) - Number(a.compatible))
    }
    return unrankedCandidates(
      clusterRuntimes.data?.items ?? [],
      namespacedRuntimes.data?.items ?? []
    )
  }, [explain.data, clusterRuntimes.data, namespacedRuntimes.data])

  const autoPick = explain.data?.items.find((c) => c.compatible && c.autoSelect)
  const compatibleCount = candidates.filter((c) => c.compatible).length
  const isSelected = (c: RuntimeCandidate) =>
    runtimeName === c.runtime.name && runtimeKind === c.runtime.kind
  const currentListed = candidates.some(isSelected)

  const select = (candidate: RuntimeCandidate) => {
    setValue('runtime.kind', candidate.runtime.kind)
    setValue('runtime.name', candidate.runtime.name, { shouldValidate: true, shouldDirty: true })
  }

  const note = !modelName
    ? 'Select a model to rank runtimes by compatibility'
    : explain.data === null
      ? 'This backend does not rank runtimes; the list is unranked'
      : explain.isError
        ? 'Runtime ranking failed; the list is unranked'
        : explain.data
          ? `${compatibleCount} of ${candidates.length} runtimes can serve the model`
          : undefined

  return (
    <CollapsibleSection
      title="Runtime"
      description="OME resolves the runtime at admission time unless one is named"
      defaultOpen
    >
      <div className="space-y-4">
        <div role="radiogroup" className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-border p-3">
            <input
              type="radio"
              value="auto"
              className={clsx(checkboxStyles.input, 'mt-0.5')}
              {...register('runtime.mode')}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Auto-select (recommended)
              </span>
              <span className="block text-xs text-muted-foreground">
                No spec.runtime; OME picks the best runtime for the model and re-evaluates as
                runtimes change.
                {autoPick ? ` Today it would pick ${autoPick.runtime.name}.` : ''}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3">
            <input
              type="radio"
              value="explicit"
              className={clsx(checkboxStyles.input, 'mt-0.5')}
              {...register('runtime.mode')}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Choose a runtime</span>
              <span className="block text-xs text-muted-foreground">
                Pins spec.runtime to one ClusterServingRuntime or ServingRuntime.
              </span>
            </span>
          </label>
        </div>

        {runtimeMode === 'explicit' && (
          <div className="space-y-3">
            {note && <p className={helpTextClassName}>{note}</p>}
            {explain.isFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" /> Ranking runtimes...
              </div>
            )}
            {runtimeName && !currentListed && (
              <p className={helpTextClassName}>
                Current runtime: <span className="font-mono">{runtimeName}</span> ({runtimeKind})
              </p>
            )}
            {candidates.length === 0 && !explain.isFetching ? (
              <p className="text-sm text-muted-foreground">No runtimes found</p>
            ) : (
              <div role="radiogroup" aria-label="Runtimes" className="space-y-2">
                {candidates.map((candidate) => (
                  <CandidateCard
                    key={`${candidate.runtime.kind}/${candidate.runtime.namespace ?? ''}/${candidate.runtime.name}`}
                    candidate={candidate}
                    selected={isSelected(candidate)}
                    ranked={ranked}
                    onSelect={() => select(candidate)}
                  />
                ))}
              </div>
            )}
            {errors.runtime?.name && (
              <p className={errorClassName}>{errors.runtime.name.message}</p>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
