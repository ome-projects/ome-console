'use client'

import { useFormContext, type FieldValues } from 'react-hook-form'
import { clsx } from 'clsx'
import {
  getInputClassName,
  gridStyles,
  labelStyles,
  errorClassName,
  helpTextClassName,
} from '../styles'
import { AutoscalerFields } from './AutoscalerFields'
import { fieldError, optionalNumber } from './fields'

export interface ComponentExtensionFieldsProps {
  /** Form path of the component's values, e.g. `engine` or `spec.engineConfig`. */
  basePath: string
  /** Namespace whose AutoscalerPolicies the policy reference select offers. */
  namespace?: string
  className?: string
}

/**
 * The ComponentExtensionSpec fields a component shares between the InferenceService and the
 * ServingRuntime forms: replica bounds and the autoscaler block. Reads the form through
 * react-hook-form's context, so it works inside any FormProvider whose values at `basePath`
 * follow `componentExtensionFormSchema`.
 */
export function ComponentExtensionFields({
  basePath,
  namespace,
  className,
}: ComponentExtensionFieldsProps) {
  const form = useFormContext<FieldValues>()
  const { register } = form
  const minPath = `${basePath}.minReplicas`
  const maxPath = `${basePath}.maxReplicas`
  const minError = fieldError(form, minPath)
  const maxError = fieldError(form, maxPath)

  return (
    <div className={clsx('space-y-6', className)}>
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Replicas</h4>
        <div className={gridStyles.cols2}>
          <div>
            <label htmlFor={minPath} className={labelStyles.base}>
              Min replicas
            </label>
            <input
              id={minPath}
              type="number"
              min={0}
              step={1}
              placeholder="1"
              {...register(minPath, optionalNumber)}
              className={getInputClassName({ error: !!minError, mono: true })}
            />
            {minError ? (
              <p className={errorClassName}>{minError}</p>
            ) : (
              <p className={helpTextClassName}>0 scales to zero and needs the KEDA autoscaler</p>
            )}
          </div>
          <div>
            <label htmlFor={maxPath} className={labelStyles.base}>
              Max replicas
            </label>
            <input
              id={maxPath}
              type="number"
              min={1}
              step={1}
              placeholder="Same as min"
              {...register(maxPath, optionalNumber)}
              className={getInputClassName({ error: !!maxError, mono: true })}
            />
            {maxError ? (
              <p className={errorClassName}>{maxError}</p>
            ) : (
              <p className={helpTextClassName}>Leave empty to inherit the runtime&apos;s bound</p>
            )}
          </div>
        </div>
      </div>

      <AutoscalerFields basePath={basePath} namespace={namespace} />
    </div>
  )
}
