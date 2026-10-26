'use client'

import { useWatch } from 'react-hook-form'
import {
  ProportionalPolicyAnchorValues,
  ScalingPolicyModeValues,
  type ScalingPolicyMode,
} from '@/lib/types/generated/ome.v1beta1'
import { useFieldError, useRuntimeFormContext } from '../RuntimeFormContext'
import { CollapsibleSection } from '../../CollapsibleSection'
import {
  getInputClassName,
  getSelectClassName,
  gridStyles,
  labelStyles,
  helpTextClassName,
  errorClassName,
} from '../../styles'

const MODE_HELP: Record<ScalingPolicyMode | '', string> = {
  '': 'Not set: every component of an InferenceService autoscales independently',
  Independent: 'Each component autoscales on its own metrics; the default',
  Proportional:
    'Followers scale in proportion to an anchor component. Accepted by the schema, but admission rejects a policy with this mode until a controller applies it',
  Pinned:
    'Accepted by the schema, but admission rejects a policy with this mode until a controller applies it',
}

const MODE_PATH = 'spec.scalingPolicy.mode'
const ANCHOR_PATH = 'spec.scalingPolicy.proportional.anchor'

/**
 * `spec.scalingPolicy`: the ScalingPolicy default for the InferenceServices that bind this
 * runtime, replaced wholesale by `isvc.spec.scalingPolicy` when the service sets one.
 */
export function ScalingPolicySection() {
  const { form } = useRuntimeFormContext()
  const { register, control } = form
  const fieldError = useFieldError()
  const mode = useWatch({ control, name: MODE_PATH })
  const anchor = useWatch({ control, name: ANCHOR_PATH })
  const followers = ProportionalPolicyAnchorValues.filter((component) => component !== anchor)

  return (
    <CollapsibleSection
      title="Scaling Policy"
      description="Coordinates replica counts across the components of an InferenceService (alpha)"
      badge={
        mode ? (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            {mode}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <p className={helpTextClassName}>
          The default for InferenceServices binding this runtime; an InferenceService that sets its
          own spec.scalingPolicy replaces it wholesale. Use it when more than one autoscaler would
          otherwise drift, such as engine and decoder in a PD-disaggregated service that needs 1:1
          sharding. Alpha: the API may change without notice.
        </p>

        <div className={gridStyles.cols2}>
          <div>
            <label htmlFor={MODE_PATH} className={labelStyles.base}>
              Mode
            </label>
            <select id={MODE_PATH} {...register(MODE_PATH)} className={getSelectClassName()}>
              <option value="">Not set</option>
              {ScalingPolicyModeValues.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <p className={helpTextClassName}>{MODE_HELP[mode ?? '']}</p>
          </div>

          {mode === 'Proportional' && (
            <div>
              <label htmlFor={ANCHOR_PATH} className={labelStyles.base}>
                Anchor
              </label>
              <select id={ANCHOR_PATH} {...register(ANCHOR_PATH)} className={getSelectClassName()}>
                {ProportionalPolicyAnchorValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <p className={helpTextClassName}>
                The component whose replica count drives the followers
              </p>
            </div>
          )}
        </div>

        {mode === 'Proportional' && (
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Ratios</h3>
            <p className={`${helpTextClassName} mb-4`}>
              Each follower&apos;s replica ratio relative to the anchor: 1 means parity, 0.25 one
              follower per four anchor replicas (rounded up). A follower left empty scales
              independently; its own min and max replicas still bound the count it is given.
            </p>
            <div className={gridStyles.cols2}>
              {followers.map((component) => {
                const path = `spec.scalingPolicy.proportional.ratios.${component}`
                const error = fieldError(path)
                return (
                  <div key={component}>
                    <label htmlFor={path} className={labelStyles.base}>
                      {component}
                    </label>
                    <input
                      id={path}
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 1 or 0.25"
                      {...register(path)}
                      className={getInputClassName({ error: !!error, mono: true })}
                    />
                    {error && <p className={errorClassName}>{error}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
