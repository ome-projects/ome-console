'use client'

import type { ReactNode } from 'react'
import { useCapability, type CapabilityCheck } from '@/lib/hooks/useCapabilities'

type CapabilityGateProps = CapabilityCheck & {
  children: ReactNode
  /** Shown instead of the children when the capability is missing. */
  fallback?: ReactNode
  /** Name of the feature for the default message, e.g. "Rollout policies". */
  label?: string
}

/**
 * Renders its children only when the connected cluster serves the given OME resource or
 * supports the given feature. While capabilities are loading, or when the backend cannot be
 * reached, the children render so a transient failure never hides a page.
 */
export function CapabilityGate(props: CapabilityGateProps) {
  const { children, fallback, label } = props
  const check: CapabilityCheck =
    'resource' in props ? { resource: props.resource } : { feature: props.feature }
  const { available } = useCapability(check)

  if (available) return <>{children}</>
  if (fallback !== undefined) return <>{fallback}</>

  const what = label ?? ('resource' in check ? check.resource : check.feature)
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <div className="max-w-lg text-center">
        <p className="text-lg font-medium">{what} is not available on this cluster</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The connected OME installation does not serve this resource. Install or upgrade OME, then
          restart the console backend; it discovers the cluster&apos;s capabilities at startup.
        </p>
      </div>
    </div>
  )
}
