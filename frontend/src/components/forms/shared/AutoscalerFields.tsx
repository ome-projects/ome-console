'use client'

import { Controller, useFormContext, useWatch, type FieldValues } from 'react-hook-form'
import { ComponentAutoscalerClassValues } from '@/lib/types/generated/ome.v1beta1'
import { useCapability } from '@/lib/hooks/useCapabilities'
import { useAutoscalerPolicies } from '@/lib/hooks/useAutoscalerPolicies'
import { YamlEditor } from '@/components/editor/YamlEditor'
import {
  getInputClassName,
  getSelectClassName,
  gridStyles,
  labelStyles,
  errorClassName,
  helpTextClassName,
} from '../styles'
import { fieldError, optionalNumber } from './fields'

const CLASS_HELP: Record<string, string> = {
  '': 'Inherit the autoscaler from the runtime, else the cluster default',
  HPA: 'Kubernetes HorizontalPodAutoscaler; defaults to a CPU 80% target when no metric is set',
  KEDA: 'KEDA ScaledObject; required for scale to zero (min replicas 0)',
  External: 'Something else scales this component; OME creates no scaler',
  None: 'No autoscaler; the component keeps its min replicas',
}

export interface AutoscalerFieldsProps {
  /** Form path of the component's values; the fields live under `${basePath}.autoscaler`. */
  basePath: string
  /** Namespace whose AutoscalerPolicies the policy reference select offers. */
  namespace?: string
}

/**
 * The component `autoscaler` block (class, one HPA CPU target, KEDA timing and triggers) and
 * the `autoscalerPolicyRef`, shown only when the cluster has the AutoscalerPolicy CRD.
 */
export function AutoscalerFields({ basePath, namespace }: AutoscalerFieldsProps) {
  const form = useFormContext<FieldValues>()
  const { register, control } = form
  const classPath = `${basePath}.autoscaler.class`
  const cpuPath = `${basePath}.autoscaler.hpa.cpuTargetUtilization`
  const pollingPath = `${basePath}.autoscaler.keda.pollingInterval`
  const cooldownPath = `${basePath}.autoscaler.keda.cooldownPeriod`
  const triggersPath = `${basePath}.autoscaler.keda.triggersYaml`
  const policyPath = `${basePath}.autoscalerPolicyRef`

  const autoscalerClass = (useWatch({ control, name: classPath }) as string | undefined) ?? ''
  const policyCapability = useCapability({ feature: 'autoscalerPolicy' })
  const policies = useAutoscalerPolicies(namespace, policyCapability.available)
  const policyNames = policies.data?.items.map((p) => p.metadata.name) ?? []

  const cpuError = fieldError(form, cpuPath)
  const pollingError = fieldError(form, pollingPath)
  const cooldownError = fieldError(form, cooldownPath)
  const triggersError = fieldError(form, triggersPath)

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-foreground">Autoscaling</h4>
      <div className={gridStyles.cols2}>
        <div>
          <label htmlFor={classPath} className={labelStyles.base}>
            Autoscaler class
          </label>
          <select id={classPath} {...register(classPath)} className={getSelectClassName()}>
            <option value="">Inherit</option>
            {ComponentAutoscalerClassValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className={helpTextClassName}>{CLASS_HELP[autoscalerClass] ?? ''}</p>
        </div>

        {autoscalerClass === 'HPA' && (
          <div>
            <label htmlFor={cpuPath} className={labelStyles.base}>
              CPU target (%)
            </label>
            <input
              id={cpuPath}
              type="number"
              min={1}
              max={100}
              step={1}
              placeholder="80"
              {...register(cpuPath, optionalNumber)}
              className={getInputClassName({ error: !!cpuError, mono: true })}
            />
            {cpuError ? (
              <p className={errorClassName}>{cpuError}</p>
            ) : (
              <p className={helpTextClassName}>
                Written as one Resource/cpu/Utilization metric in hpa.metrics
              </p>
            )}
          </div>
        )}
      </div>

      {autoscalerClass === 'KEDA' && (
        <div className="space-y-4">
          <div className={gridStyles.cols2}>
            <div>
              <label htmlFor={pollingPath} className={labelStyles.base}>
                Polling interval (s)
              </label>
              <input
                id={pollingPath}
                type="number"
                min={0}
                step={1}
                placeholder="KEDA default"
                {...register(pollingPath, optionalNumber)}
                className={getInputClassName({ error: !!pollingError, mono: true })}
              />
              {pollingError && <p className={errorClassName}>{pollingError}</p>}
            </div>
            <div>
              <label htmlFor={cooldownPath} className={labelStyles.base}>
                Cooldown period (s)
              </label>
              <input
                id={cooldownPath}
                type="number"
                min={0}
                step={1}
                placeholder="KEDA default"
                {...register(cooldownPath, optionalNumber)}
                className={getInputClassName({ error: !!cooldownError, mono: true })}
              />
              {cooldownError && <p className={errorClassName}>{cooldownError}</p>}
            </div>
          </div>
          <div>
            <span className={labelStyles.base}>Triggers (YAML list)</span>
            <Controller
              control={control}
              name={triggersPath}
              render={({ field }) => (
                <YamlEditor
                  value={(field.value as string | undefined) ?? ''}
                  onChange={field.onChange}
                  height="180px"
                  placeholder={
                    '- type: prometheus\n  metadata:\n    serverAddress: http://prometheus:9090\n    query: sum(rate(http_requests_total[1m]))\n    threshold: "100"'
                  }
                  aria-label="KEDA triggers"
                />
              )}
            />
            {triggersError ? (
              <p className={errorClassName}>{triggersError}</p>
            ) : (
              <p className={helpTextClassName}>
                Passed through verbatim to the ScaledObject; at least one trigger is required
              </p>
            )}
          </div>
        </div>
      )}

      {policyCapability.available && (
        <div className="max-w-md">
          <label htmlFor={policyPath} className={labelStyles.base}>
            Autoscaler policy
          </label>
          {policies.data ? (
            <select id={policyPath} {...register(policyPath)} className={getSelectClassName()}>
              <option value="">None</option>
              {policyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={policyPath}
              type="text"
              placeholder="AutoscalerPolicy name"
              {...register(policyPath)}
              className={getInputClassName({ mono: true })}
            />
          )}
          <p className={helpTextClassName}>
            Renders this component&apos;s autoscaler from an AutoscalerPolicy in the namespace; an
            inline class above outranks it
          </p>
        </div>
      )}
    </div>
  )
}
