'use client'

import { UseFormRegister } from 'react-hook-form'
import { inputMonoClassName, labelStyles, gridStyles } from '../../styles'

interface ScalingConfigProps {
  basePath: string
  register: UseFormRegister<any>
}

/**
 * Replica bounds for engine/decoder/router configs. The autoscaler block (class, HPA metrics,
 * KEDA triggers) replaces the removed scaleTarget/scaleMetric fields and gets its own fields in
 * the component form.
 */
export function ScalingConfig({ basePath, register }: ScalingConfigProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-4">Scaling Configuration</h3>
      <div className={gridStyles.cols2}>
        <div>
          <label className={labelStyles.base}>Min Replicas</label>
          <input
            type="number"
            {...register(`${basePath}.minReplicas`, { valueAsNumber: true })}
            className={inputMonoClassName}
            placeholder="1"
          />
        </div>
        <div>
          <label className={labelStyles.base}>Max Replicas</label>
          <input
            type="number"
            {...register(`${basePath}.maxReplicas`, { valueAsNumber: true })}
            className={inputMonoClassName}
            placeholder="5"
          />
        </div>
      </div>
    </div>
  )
}
