'use client'

import { useFieldArray, useWatch, type Control, type FieldValues } from 'react-hook-form'
import { MODEL_FORMAT_OPTIONS, MODEL_FRAMEWORK_OPTIONS } from '@/lib/constants/model-options'
import { useFieldError, useRuntimeFormContext } from '../RuntimeFormContext'
import { emptyModelFormat } from '../runtimeFormValues'
import { CollapsibleSection } from '../../CollapsibleSection'
import { optionalNumber } from '../../shared/fields'
import {
  getInputClassName,
  getSelectClassName,
  inputMonoClassName,
  labelStyles,
  gridStyles,
  errorClassName,
  helpTextClassName,
} from '../../styles'

const QUANTIZATION_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'fp8', label: 'FP8' },
  { value: 'fbgemm_fp8', label: 'FBGEMM FP8' },
  { value: 'int4', label: 'INT4' },
] as const

interface SelectOption {
  readonly value: string
  readonly label: string
}

/** The options plus the stored value when it is not one of them, so an edit never changes it unseen. */
function withCurrent(options: readonly SelectOption[], current: unknown): SelectOption[] {
  if (typeof current !== 'string' || !current || options.some((o) => o.value === current)) {
    return [...options]
  }
  return [...options, { value: current, label: `${current} (as stored)` }]
}

/**
 * Model formats section for RuntimeForm.
 * Manages the list of supported model formats with their configurations.
 */
export function ModelFormatsSection() {
  const { form } = useRuntimeFormContext()
  const { register, control } = form
  const fieldError = useFieldError()

  const {
    fields: formatFields,
    append: appendFormat,
    remove: removeFormat,
  } = useFieldArray({
    // The loose form values defeat react-hook-form's array path typing; the path is a real array.
    control: control as unknown as Control<FieldValues>,
    name: 'spec.supportedModelFormats',
  })
  const entries = useWatch({ control, name: 'spec.supportedModelFormats' })
  const listError = fieldError('spec.supportedModelFormats')

  return (
    <CollapsibleSection title="Supported Model Formats">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Define the model formats this runtime can execute; runtime selection matches the format
            and framework names case-sensitively
          </p>
          <button
            type="button"
            onClick={() => appendFormat(emptyModelFormat())}
            className="rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
          >
            + Add Format
          </button>
        </div>
        {listError && <p className={errorClassName}>{listError}</p>}

        <div className="space-y-4">
          {formatFields.map((field, index) => {
            const base = `spec.supportedModelFormats.${index}`
            const entry = entries?.[index]
            const formatError = fieldError(`${base}.modelFormat.name`)
            const frameworkError = fieldError(`${base}.modelFramework.name`)
            const priorityError = fieldError(`${base}.priority`)
            return (
              <div key={field.id} className="rounded-xl border border-border bg-card/50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Format {index + 1}</h4>
                  {formatFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFormat(index)}
                      className="text-sm font-medium text-destructive hover:text-destructive/80 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className={gridStyles.cols2}>
                  {/* Format Name */}
                  <div>
                    <label htmlFor={`${base}.modelFormat.name`} className={labelStyles.base}>
                      Format Name *
                    </label>
                    <select
                      id={`${base}.modelFormat.name`}
                      {...register(`${base}.modelFormat.name` as const)}
                      className={getSelectClassName({ error: !!formatError })}
                    >
                      {withCurrent(MODEL_FORMAT_OPTIONS, entry?.modelFormat?.name).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {formatError && <p className={errorClassName}>{formatError}</p>}
                  </div>

                  {/* Format Version */}
                  <div>
                    <label htmlFor={`${base}.modelFormat.version`} className={labelStyles.base}>
                      Format Version
                    </label>
                    <input
                      id={`${base}.modelFormat.version`}
                      type="text"
                      {...register(`${base}.modelFormat.version` as const)}
                      className={inputMonoClassName}
                      placeholder="1.0"
                    />
                    <p className={helpTextClassName}>
                      Matched against the model&apos;s format version when set
                    </p>
                  </div>

                  {/* Framework Name */}
                  <div>
                    <label htmlFor={`${base}.modelFramework.name`} className={labelStyles.base}>
                      Framework Name *
                    </label>
                    <select
                      id={`${base}.modelFramework.name`}
                      {...register(`${base}.modelFramework.name` as const)}
                      className={getSelectClassName({ error: !!frameworkError })}
                    >
                      {withCurrent(MODEL_FRAMEWORK_OPTIONS, entry?.modelFramework?.name).map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        )
                      )}
                    </select>
                    {frameworkError && <p className={errorClassName}>{frameworkError}</p>}
                  </div>

                  {/* Framework Version */}
                  <div>
                    <label htmlFor={`${base}.modelFramework.version`} className={labelStyles.base}>
                      Framework Version
                    </label>
                    <input
                      id={`${base}.modelFramework.version`}
                      type="text"
                      {...register(`${base}.modelFramework.version` as const)}
                      className={inputMonoClassName}
                      placeholder="4.45.0"
                    />
                    <p className={helpTextClassName}>
                      Matched against the model&apos;s framework version when set
                    </p>
                  </div>

                  {/* Model Architecture */}
                  <div>
                    <label htmlFor={`${base}.modelArchitecture`} className={labelStyles.base}>
                      Model Architecture
                    </label>
                    <input
                      id={`${base}.modelArchitecture`}
                      type="text"
                      {...register(`${base}.modelArchitecture` as const)}
                      className={inputMonoClassName}
                      placeholder="LlamaForCausalLM"
                    />
                  </div>

                  {/* Quantization */}
                  <div>
                    <label htmlFor={`${base}.quantization`} className={labelStyles.base}>
                      Quantization
                    </label>
                    <select
                      id={`${base}.quantization`}
                      {...register(`${base}.quantization` as const)}
                      className={getSelectClassName()}
                    >
                      {withCurrent(QUANTIZATION_OPTIONS, entry?.quantization).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label htmlFor={`${base}.priority`} className={labelStyles.base}>
                      Priority
                    </label>
                    <input
                      id={`${base}.priority`}
                      type="number"
                      min={1}
                      step={1}
                      {...register(`${base}.priority` as const, optionalNumber)}
                      className={getInputClassName({ mono: true, error: !!priorityError })}
                      placeholder="1"
                    />
                    {priorityError ? (
                      <p className={errorClassName}>{priorityError}</p>
                    ) : (
                      <p className={helpTextClassName}>
                        Breaks ties between auto-selectable runtimes; higher wins
                      </p>
                    )}
                  </div>

                  {/* Auto Select */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                    <input
                      type="checkbox"
                      id={`${base}.autoSelect`}
                      {...register(`${base}.autoSelect` as const)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label
                      htmlFor={`${base}.autoSelect`}
                      className="text-sm text-foreground font-medium"
                    >
                      Auto Select
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </CollapsibleSection>
  )
}
