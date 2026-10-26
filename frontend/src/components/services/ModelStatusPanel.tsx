import type { ModelStatus, MountedOverlay } from '@/lib/types/generated/ome.v1beta1'
import { formatTimestamp } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Revision } from './Revision'

interface ModelStatusPanelProps {
  /** `status.modelStatus`; unset on a lean service with no `spec.model`. */
  modelStatus?: ModelStatus
  /** `status.mountedOverlays`: the overlays wired into the current pod spec. */
  mountedOverlays?: MountedOverlay[]
}

const headerClass =
  'px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
const cellClass = 'px-4 py-2 text-sm'

/** How the pods are loading the model: transition, per-revision states, the last failure. */
export function ModelStatusPanel({ modelStatus, mountedOverlays }: ModelStatusPanelProps) {
  const states = modelStatus?.modelRevisionStates
  const copies = modelStatus?.modelCopies
  const failure = modelStatus?.lastFailureInfo
  const hasStatus = !!(modelStatus?.transitionStatus || states || copies || failure)
  const overlays = mountedOverlays ?? []
  if (!hasStatus && overlays.length === 0) return null

  return (
    <Panel title="Model status" description="status.modelStatus and the mounted overlays">
      {hasStatus && (
        <FieldGrid columns={4}>
          <Field label="Transition">
            {modelStatus?.transitionStatus ? (
              <StatusBadge state={modelStatus.transitionStatus} size="sm" />
            ) : (
              '-'
            )}
          </Field>
          {states && (
            <>
              <Field label="Active model state">{states.activeModelState || '-'}</Field>
              <Field label="Target model state">{states.targetModelState || '-'}</Field>
            </>
          )}
          {copies && (
            <Field label="Copies">
              {copies.totalCopies ?? 0} loaded
              {copies.failedCopies > 0 && (
                <span className="text-destructive">, {copies.failedCopies} failed</span>
              )}
            </Field>
          )}
        </FieldGrid>
      )}

      {failure && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <h3 className="text-sm font-medium text-destructive">Last failure</h3>
          <FieldGrid columns={4} className="mt-3">
            <Field label="Reason">{failure.reason || '-'}</Field>
            <Field label="Location">
              <span className="font-mono text-xs">{failure.location || '-'}</span>
            </Field>
            <Field label="Exit code">{failure.exitCode ?? '-'}</Field>
            <Field label="Time">{formatTimestamp(failure.time)}</Field>
            {failure.modelRevisionName && (
              <Field label="Model revision">
                <Revision name={failure.modelRevisionName} />
              </Field>
            )}
          </FieldGrid>
          {failure.message && (
            <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-muted/50 p-3 font-mono text-xs">
              {failure.message}
            </pre>
          )}
        </div>
      )}

      {overlays.length > 0 && (
        <div className={hasStatus || failure ? 'mt-6' : ''}>
          <h3 className="mb-3 text-sm font-medium">Mounted overlays ({overlays.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className={headerClass}>Name</th>
                  <th className={headerClass}>Distribution</th>
                  <th className={headerClass}>Mount path</th>
                  <th className={headerClass}>Env var</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {overlays.map((overlay) => (
                  <tr key={overlay.name}>
                    <td className={`${cellClass} font-medium`}>{overlay.name}</td>
                    <td className={cellClass}>{overlay.distribution}</td>
                    <td className={`${cellClass} font-mono text-xs`}>
                      {overlay.mountPath || <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className={`${cellClass} font-mono text-xs`}>{overlay.envVar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  )
}
