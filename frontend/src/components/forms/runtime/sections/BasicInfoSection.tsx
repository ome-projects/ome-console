'use client'

import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldValues,
} from 'react-hook-form'
import { useNamespaces } from '@/lib/hooks/useNamespaces'
import { useRuntimes } from '@/lib/hooks/useRuntimes'
import {
  INHERIT_FROM_ANNOTATION,
  RUNTIME_PROFILE_ANNOTATION,
} from '@/lib/constants/runtime-annotations'
import {
  RUNTIME_KINDS,
  inheritFromCandidates,
  type RuntimeKind,
} from '@/lib/validation/runtime-schema'
import { useFieldError, useRuntimeFormContext, useRuntimeScope } from '../RuntimeFormContext'
import { CollapsibleSection } from '../../CollapsibleSection'
import {
  getInputClassName,
  getSelectClassName,
  labelStyles,
  gridStyles,
  helpTextClassName,
  errorClassName,
} from '../../styles'

const SCOPE_HELP: Record<RuntimeKind, string> = {
  ClusterServingRuntime: 'Cluster-scoped: InferenceServices in any namespace can use it',
  ServingRuntime: 'Namespaced: only InferenceServices in its namespace can use it',
}

const checkboxClassName =
  'h-5 w-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 focus:ring-offset-2 transition-all'

/**
 * Basic information section for RuntimeForm.
 * Handles scope, name, namespace, the disabled and runtime-profile toggles, inheritance, model
 * size range, and protocol versions.
 */
export function BasicInfoSection() {
  const { form, isEditMode } = useRuntimeFormContext()
  const { register, control, setValue } = form
  const fieldError = useFieldError()
  const { kind, namespace } = useRuntimeScope()
  const name = useWatch({ control, name: 'metadata.name' })
  const inheritFrom = useWatch({ control, name: 'inheritFrom' })
  const runtimeProfile = useWatch({ control, name: 'runtimeProfile' })

  const { data: namespaces } = useNamespaces()
  const clusterRuntimes = useRuntimes()
  // Without a namespace this lists the cluster runtimes again; the candidates ignore it then.
  const namespacedRuntimes = useRuntimes(namespace)

  const namespaceOptions = Array.from(
    new Set([...(namespaces?.items ?? []), ...(namespace ? [namespace] : [])])
  )
  const candidates = inheritFromCandidates(
    { kind, name, namespace },
    clusterRuntimes.data?.items ?? [],
    namespace ? (namespacedRuntimes.data?.items ?? []) : []
  )
  const ownCandidates = candidates.filter((runtime) => runtime.metadata.namespace)
  const clusterCandidates = candidates.filter((runtime) => !runtime.metadata.namespace)
  const candidatesLoaded = !!clusterRuntimes.data && (!namespace || !!namespacedRuntimes.data)
  const parentMissing =
    !!inheritFrom &&
    candidatesLoaded &&
    !candidates.some((runtime) => runtime.metadata.name === inheritFrom)

  const {
    fields: protocolFields,
    append: appendProtocol,
    remove: removeProtocol,
  } = useFieldArray({
    // A list of strings is not a field array in react-hook-form's types, though it works as one.
    control: control as unknown as Control<FieldValues>,
    name: 'spec.protocolVersions',
  })

  const profileField = register('runtimeProfile')
  const nameError = fieldError('metadata.name')
  const namespaceError = fieldError('metadata.namespace')
  const inheritError = fieldError('inheritFrom')
  const disabledError = fieldError('spec.disabled')
  const minError = fieldError('spec.modelSizeRange.min')
  const maxError = fieldError('spec.modelSizeRange.max')

  return (
    <CollapsibleSection title="Basic Information" defaultOpen>
      <div className="space-y-6">
        {/* Scope */}
        <div>
          <span className={labelStyles.base}>Scope</span>
          <div className={gridStyles.cols2} role="radiogroup" aria-label="Scope">
            {RUNTIME_KINDS.map((value) => (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                  kind === value ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-slate-50'
                } ${isEditMode ? 'opacity-70' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  value={value}
                  {...register('kind')}
                  disabled={isEditMode}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{value}</span>
                  <span className="block text-xs text-muted-foreground">{SCOPE_HELP[value]}</span>
                </span>
              </label>
            ))}
          </div>
          {isEditMode && (
            <p className={helpTextClassName}>Scope cannot be changed after creation</p>
          )}
        </div>

        {/* Name and Namespace */}
        <div className={gridStyles.cols2}>
          <div>
            <label htmlFor="metadata.name" className={labelStyles.base}>
              Name *
            </label>
            <input
              id="metadata.name"
              type="text"
              {...register('metadata.name')}
              disabled={isEditMode}
              className={getInputClassName({
                disabled: isEditMode,
                mono: true,
                error: !!nameError,
              })}
              placeholder="my-runtime"
            />
            {isEditMode ? (
              <p className={helpTextClassName}>Name cannot be changed after creation</p>
            ) : (
              nameError && <p className={errorClassName}>{nameError}</p>
            )}
          </div>

          {kind === 'ServingRuntime' && (
            <div>
              <label htmlFor="metadata.namespace" className={labelStyles.base}>
                Namespace *
              </label>
              {/* Controlled, so the stored value stays selected once the namespaces load. */}
              <Controller
                control={control}
                name="metadata.namespace"
                render={({ field }) => (
                  <select
                    id="metadata.namespace"
                    ref={field.ref}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={isEditMode}
                    className={getSelectClassName({
                      disabled: isEditMode,
                      error: !!namespaceError,
                    })}
                  >
                    <option value="">Select a namespace...</option>
                    {namespaceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              />
              {isEditMode ? (
                <p className={helpTextClassName}>Namespace cannot be changed</p>
              ) : namespaceError ? (
                <p className={errorClassName}>{namespaceError}</p>
              ) : (
                <p className={helpTextClassName}>The ServingRuntime is created in this namespace</p>
              )}
            </div>
          )}
        </div>

        {/* Disabled Toggle */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <input
            type="checkbox"
            id="spec.disabled"
            {...register('spec.disabled')}
            disabled={runtimeProfile}
            className={checkboxClassName}
          />
          <label htmlFor="spec.disabled" className="flex-1">
            <span className="text-sm font-medium text-foreground block">Disabled</span>
            <span className="text-xs text-muted-foreground">
              {runtimeProfile
                ? 'Forced on: a runtime profile must be disabled'
                : 'Disable this runtime from being selected'}
            </span>
            {disabledError && <span className={errorClassName}>{disabledError}</span>}
          </label>
        </div>

        {/* Runtime profile */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <input
            type="checkbox"
            id="runtimeProfile"
            {...profileField}
            onChange={(event) => {
              void profileField.onChange(event)
              // The webhook requires a profile to be disabled; set it rather than let the dry run fail.
              if (event.target.checked) setValue('spec.disabled', true, { shouldDirty: true })
            }}
            className={checkboxClassName}
          />
          <label htmlFor="runtimeProfile" className="flex-1">
            <span className="text-sm font-medium text-foreground block">Runtime profile</span>
            <span className="text-xs text-muted-foreground">
              Exists only to be inherited from ({RUNTIME_PROFILE_ANNOTATION}: &quot;true&quot;); the
              webhook requires it to be disabled, so Disabled is forced on
            </span>
          </label>
        </div>

        {/* Inherit from */}
        <div>
          <label htmlFor="inheritFrom" className={labelStyles.base}>
            Inherit from
          </label>
          {/* Controlled, so the stored parent stays selected once the runtime lists load. */}
          <Controller
            control={control}
            name="inheritFrom"
            render={({ field }) => (
              <select
                id="inheritFrom"
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className={getSelectClassName({ error: !!inheritError })}
              >
                <option value="">None</option>
                {parentMissing && <option value={inheritFrom}>{inheritFrom} (not found)</option>}
                {ownCandidates.length > 0 && (
                  <optgroup label={`ServingRuntimes in ${namespace}`}>
                    {ownCandidates.map((runtime) => (
                      <option key={`ns/${runtime.metadata.name}`} value={runtime.metadata.name}>
                        {runtime.metadata.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {clusterCandidates.length > 0 && (
                  <optgroup label="ClusterServingRuntimes">
                    {clusterCandidates.map((runtime) => (
                      <option
                        key={`cluster/${runtime.metadata.name}`}
                        value={runtime.metadata.name}
                      >
                        {runtime.metadata.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          />
          {inheritError ? (
            <p className={errorClassName}>{inheritError}</p>
          ) : (
            <p className={helpTextClassName}>
              Takes the parent&apos;s spec and sets only what differs here (
              {INHERIT_FROM_ANNOTATION}); applied when an InferenceService names this runtime. A
              ClusterServingRuntime inherits from ClusterServingRuntimes; a ServingRuntime from the
              ServingRuntimes of its namespace or from ClusterServingRuntimes
            </p>
          )}
        </div>

        {/* Model Size Range */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">Model Size Range</h3>
          <p className={`${helpTextClassName} mb-4`}>
            Parameter counts with an uppercase M, B or T suffix, e.g. 2B to 8B, compared with the
            model&apos;s size during auto-selection; leave a bound empty for none
          </p>
          <div className={gridStyles.cols2}>
            <div>
              <label htmlFor="spec.modelSizeRange.min" className={labelStyles.base}>
                Minimum Size
              </label>
              <input
                id="spec.modelSizeRange.min"
                type="text"
                {...register('spec.modelSizeRange.min')}
                className={getInputClassName({ mono: true, error: !!minError })}
                placeholder="e.g., 1B"
              />
              {minError && <p className={errorClassName}>{minError}</p>}
            </div>
            <div>
              <label htmlFor="spec.modelSizeRange.max" className={labelStyles.base}>
                Maximum Size
              </label>
              <input
                id="spec.modelSizeRange.max"
                type="text"
                {...register('spec.modelSizeRange.max')}
                className={getInputClassName({ mono: true, error: !!maxError })}
                placeholder="e.g., 70B"
              />
              {maxError && <p className={errorClassName}>{maxError}</p>}
            </div>
          </div>
        </div>

        {/* Protocol Versions */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Protocol Versions</h3>
              <p className={helpTextClassName}>
                The inference protocols the runtime serves: openAI, openInference-v1 or
                openInference-v2
              </p>
            </div>
            <button
              type="button"
              onClick={() => appendProtocol('')}
              className="rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
            >
              + Add Protocol
            </button>
          </div>
          <div className="space-y-3">
            {protocolFields.map((field, index) => {
              const path = `spec.protocolVersions.${index}`
              const error = fieldError(path)
              return (
                <div key={field.id}>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      aria-label={`Protocol ${index + 1}`}
                      {...register(`spec.protocolVersions.${index}` as const)}
                      className={getInputClassName({ mono: true, error: !!error })}
                      placeholder="e.g., openAI"
                    />
                    <button
                      type="button"
                      onClick={() => removeProtocol(index)}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  {error && <p className={errorClassName}>{error}</p>}
                </div>
              )
            })}
            {protocolFields.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No protocols defined</p>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
