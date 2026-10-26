import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { conditionReason, conditionState, findCondition, resourceHref } from '@/lib/utils'
import type { ClusterServingRuntime } from '@/lib/types/runtime'

/** Names the runtime this one inherits from; the parent lives in the same scope. */
export const INHERIT_FROM_ANNOTATION = 'ome.io/inherit-from'

export function inheritFrom(runtime: ClusterServingRuntime): string | undefined {
  return runtime.metadata.annotations?.[INHERIT_FROM_ANNOTATION] || undefined
}

/** The `InheritanceReady` condition as a badge; nothing until the controller reports it. */
export function InheritanceBadge({
  runtime,
  size = 'md',
}: {
  runtime: ClusterServingRuntime
  size?: 'sm' | 'md'
}) {
  const conditions = runtime.status?.conditions
  if (!findCondition(conditions, 'InheritanceReady')) return null
  return (
    <StatusBadge
      state={conditionState(conditions, 'InheritanceReady')}
      size={size}
      title={conditionReason(conditions, 'InheritanceReady')}
    />
  )
}

/**
 * `status.inheritanceChain` as a breadcrumb, root first, ending in the runtime itself. Nothing
 * when the chain is empty or only `[self]`, which OME writes when no inheritance is declared.
 */
export function InheritanceChain({ runtime }: { runtime: ClusterServingRuntime }) {
  const chain = runtime.status?.inheritanceChain
  if (!chain || chain.length < 2) return null
  const last = chain.length - 1
  return (
    <nav aria-label="Inheritance chain" className="flex flex-wrap items-center gap-1 text-sm">
      {chain.map((name, index) => (
        <span key={`${index}-${name}`} className="inline-flex items-center gap-1">
          {index > 0 && (
            <span className="text-muted-foreground" aria-hidden="true">
              ›
            </span>
          )}
          {index === last ? (
            <span className="font-medium text-gray-900" aria-current="page">
              {name}
            </span>
          ) : (
            <Link
              href={resourceHref('/runtimes', {
                metadata: { name, namespace: runtime.metadata.namespace },
              })}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              {name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
