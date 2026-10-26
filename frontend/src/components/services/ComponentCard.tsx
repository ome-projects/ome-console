import type { ComponentStatusSpec } from '@/lib/types/service'
import type { RolloutHold } from '@/lib/types/replica'
import type {
  CanaryStatus,
  ComponentAutoscalerStatus,
  ComponentTrafficTarget,
  LifecycleStatus,
} from '@/lib/types/generated/ome.v1beta1'
import { componentLabel, formatTimestamp, isOMENativeComponent } from '@/lib/utils'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { Chip } from '@/components/ui/Chip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CopyButton } from '@/components/ui/CopyButton'
import { ConditionsTable } from '@/components/ui/ConditionsTable'
import { Revision } from './Revision'

interface ComponentCardProps {
  /** engine, decoder or router. */
  name: string
  /** `status.components[name]`. */
  status: ComponentStatusSpec
}

type LifecycleCounter =
  | 'replicas'
  | 'readyReplicas'
  | 'servingReplicas'
  | 'availableReplicas'
  | 'updatedReplicas'
  | 'updatedReadyReplicas'

const counters: { key: LifecycleCounter; label: string }[] = [
  { key: 'replicas', label: 'Replicas' },
  { key: 'readyReplicas', label: 'Ready' },
  { key: 'servingReplicas', label: 'Serving' },
  { key: 'availableReplicas', label: 'Available' },
  { key: 'updatedReplicas', label: 'Updated' },
  { key: 'updatedReadyReplicas', label: 'Updated ready' },
]

function LifecycleSummary({ lifecycle }: { lifecycle: LifecycleStatus }) {
  return (
    <section aria-label="Lifecycle">
      <h4 className="mb-2 text-sm font-medium">Lifecycle</h4>
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {counters.map(({ key, label }) => (
          <div key={key} className="flex flex-col-reverse rounded-lg bg-muted/50 px-3 py-2">
            <dd className="text-lg font-semibold leading-tight">{lifecycle[key] ?? 0}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <FieldGrid columns={2} className="mt-3">
        <Field label="Current revision">
          <Revision name={lifecycle.currentRevision} />
        </Field>
        <Field label="Update revision">
          <Revision name={lifecycle.updateRevision} />
        </Field>
      </FieldGrid>
      {lifecycle.conditions && lifecycle.conditions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Lifecycle conditions ({lifecycle.conditions.length})
          </summary>
          <div className="mt-2">
            <ConditionsTable conditions={lifecycle.conditions} />
          </div>
        </details>
      )}
    </section>
  )
}

function RolloutHoldNote({ hold }: { hold: RolloutHold }) {
  return (
    <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
      <span className="font-medium text-warning">Rollout held by the {hold.gate} gate</span>
      <span className="text-muted-foreground"> since {formatTimestamp(hold.since)}</span>
      {hold.target && (
        <span className="text-muted-foreground">
          {' '}
          toward <Revision name={hold.target} />
        </span>
      )}
      <div className="mt-1 break-words">{hold.reason}</div>
    </div>
  )
}

function AutoscalerSummary({ autoscaler }: { autoscaler: ComponentAutoscalerStatus }) {
  const policy = autoscaler.policy
  const shadowed = autoscaler.shadowedPolicyRef
  return (
    <section aria-label="Autoscaler">
      <h4 className="mb-2 text-sm font-medium">Autoscaler</h4>
      <FieldGrid columns={3}>
        <Field label="Class">{autoscaler.class || '-'}</Field>
        <Field label="Managed by">{autoscaler.managedBy || '-'}</Field>
        <Field label="Spec source">{autoscaler.specSource || '-'}</Field>
        <Field label="Policy" title={policy?.resolvedDigest}>
          {policy?.name ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {policy.name}
              {policy.observedGeneration !== undefined && (
                <Chip>generation {policy.observedGeneration}</Chip>
              )}
            </span>
          ) : (
            '-'
          )}
        </Field>
        <Field label="Replicas">
          {autoscaler.managedBy === 'ome' ? (
            <span>
              {autoscaler.currentReplicas ?? 0}
              <span className="text-muted-foreground"> current, </span>
              {autoscaler.desiredReplicas ?? 0}
              <span className="text-muted-foreground"> desired</span>
            </span>
          ) : (
            <span className="text-muted-foreground">not reported</span>
          )}
        </Field>
        <Field label="Last scale">{formatTimestamp(autoscaler.lastScaleTime)}</Field>
      </FieldGrid>
      {shadowed?.name && (
        <p className="mt-2 text-xs text-muted-foreground" title={shadowed.wouldRenderDigest}>
          The inline autoscaler block shadows policy {shadowed.name}.
        </p>
      )}
      {autoscaler.conditions && autoscaler.conditions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Autoscaler conditions ({autoscaler.conditions.length})
          </summary>
          <div className="mt-2">
            <ConditionsTable conditions={autoscaler.conditions} />
          </div>
        </details>
      )}
    </section>
  )
}

function TrafficTable({ traffic }: { traffic: ComponentTrafficTarget[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Traffic</h4>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-1 pr-4 font-medium">Revision</th>
            <th className="py-1 pr-4 font-medium">Percent</th>
            <th className="py-1 pr-4 font-medium">Tag</th>
          </tr>
        </thead>
        <tbody>
          {traffic.map((target) => (
            <tr key={target.revisionName} className="border-t border-border">
              <td className="py-1 pr-4">
                <Revision name={target.revisionName} />
                {target.latestRevision && (
                  <Chip tone="success" className="ml-2">
                    latest
                  </Chip>
                )}
                {target.pairingProtocol && (
                  <Chip mono className="ml-2" title="pairing protocol">
                    {target.pairingProtocol}
                  </Chip>
                )}
              </td>
              <td className="py-1 pr-4 font-medium">{target.percent}%</td>
              <td className="py-1 pr-4 text-muted-foreground">{target.tag || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CanarySummary({ canary }: { canary: CanaryStatus }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">Canary</h4>
      <FieldGrid columns={3}>
        <Field label="Canary revision">
          <Revision name={canary.canaryRevisionHash} />
        </Field>
        <Field label="Stable revision">
          <Revision name={canary.stableRevisionHash} />
        </Field>
        <Field label="Step">{canary.currentStep}</Field>
        <Field label="Traffic weight">{canary.observedTrafficWeight}%</Field>
        <Field label="Promoted through">
          {canary.promotedThrough ? <Revision name={canary.promotedThrough} /> : '-'}
        </Field>
        <Field label="Outcome">
          {canary.failed ? (
            <span className="text-destructive">
              Failed: {canary.failed.reason}
              {canary.failed.time && (
                <span className="text-muted-foreground">
                  {' '}
                  at {formatTimestamp(canary.failed.time)}
                </span>
              )}
            </span>
          ) : canary.rolledBackRevisionHash ? (
            <span>
              Rolled back <Revision name={canary.rolledBackRevisionHash} />
            </span>
          ) : canary.preStepHold ? (
            'Held before the next step'
          ) : (
            '-'
          )}
        </Field>
      </FieldGrid>
      <p className="mt-2 text-xs text-muted-foreground">
        Steps and analysis results are in the Rollout panel.
      </p>
    </div>
  )
}

/** One `status.components` entry: endpoint, scale target, rollout state, lifecycle, autoscaler. */
export function ComponentCard({ name, status }: ComponentCardProps) {
  const label = componentLabel(name)
  const ref = status.scaleTargetRef
  const accelerator = status.selectedAccelerator
  const traffic = status.traffic ?? []

  return (
    <section
      aria-label={`${label} component`}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
        <h3 className="text-base font-semibold">{label}</h3>
        {isOMENativeComponent(status) && (
          <Chip tone="accent" title="Managed by an InferenceReplica">
            OMENative
          </Chip>
        )}
        {status.rolloutPhase && <StatusBadge state={status.rolloutPhase} size="sm" />}
      </header>

      <div className="space-y-5 p-5">
        <FieldGrid columns={2}>
          <Field label="URL">
            {status.url ? (
              <span className="inline-flex max-w-full items-start gap-1">
                <span className="break-all font-mono text-xs">{status.url}</span>
                <CopyButton text={status.url} />
              </span>
            ) : (
              '-'
            )}
          </Field>
          <Field label="Scale target" title={ref?.apiVersion}>
            {ref ? (
              <span className="font-mono text-xs">
                {ref.kind}/{ref.name}
              </span>
            ) : (
              '-'
            )}
          </Field>
          <Field label="Accelerator" title={accelerator?.reason}>
            {accelerator?.acceleratorClass || '-'}
          </Field>
          <Field label="Latest ready revision">
            <Revision name={status.latestReadyRevision} />
          </Field>
          <Field label="Rolled out revision">
            <Revision name={status.latestRolledoutRevision} />
          </Field>
          <Field label="Previous revision">
            <Revision name={status.previousRolledoutRevision} />
          </Field>
        </FieldGrid>

        {status.lifecycle && <LifecycleSummary lifecycle={status.lifecycle} />}
        {status.lifecycle?.rolloutHold && <RolloutHoldNote hold={status.lifecycle.rolloutHold} />}
        {status.autoscaler && <AutoscalerSummary autoscaler={status.autoscaler} />}
        {traffic.length > 0 && <TrafficTable traffic={traffic} />}
        {status.canary && <CanarySummary canary={status.canary} />}
      </div>
    </section>
  )
}
