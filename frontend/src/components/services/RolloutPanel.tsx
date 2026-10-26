import type { ComponentStatusSpec, InferenceServiceStatus } from '@/lib/types/service'
import type {
  AnalysisMetricResult,
  CanaryStatus,
  RolloutCoordinationGroupStatus,
  RolloutGroup,
  RolloutGroupResolution,
  RolloutGroupStep,
  RolloutPolicyRef,
  RolloutRun,
  RolloutRunRecord,
  RolloutRunTarget,
  RolloutSpec,
} from '@/lib/types/generated/ome.v1beta1'
import { componentLabel, findCondition, formatTimestamp, sortComponents } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { Chip } from '@/components/ui/Chip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Revision } from './Revision'

interface RolloutPanelProps {
  /** The service's status; the panel reads `rollout`, `rolloutCoordination`, `components` and `conditions`. */
  status?: InferenceServiceStatus
  /** `spec.rollout`, for the canary steps between runs (the pinned plan carries them during one). */
  rolloutSpec?: RolloutSpec
}

/** Whether there is anything to show: a run, coordination groups, a canary or plan drift. */
export function hasRolloutStatus(status?: InferenceServiceStatus): boolean {
  if (!status) return false
  const canary = Object.values(status.components ?? {}).some((component) => component.canary)
  const drift = findCondition(status.conditions, 'RolloutPlanDrift')?.status === 'True'
  return !!status.rollout || !!status.rolloutCoordination?.groups?.length || canary || drift
}

const headerClass =
  'px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
const cellClass = 'px-3 py-2 text-sm align-top'

function progressionOf(group: RolloutGroup): string {
  if (group.canary) return 'Canary'
  if (group.rollingUpdate) return 'Rolling update'
  return 'Blue/green'
}

/** How a canary step advances, from its gate. */
function gateOf(step: RolloutGroupStep): string {
  if (step.analysis) {
    return step.pause?.duration ? `analysis after ${step.pause.duration}` : 'analysis'
  }
  if (step.pause) return step.pause.duration ? `after ${step.pause.duration}` : 'manual promote'
  return 'immediate'
}

function PolicyRefChip({ policyRef }: { policyRef?: RolloutPolicyRef }) {
  if (!policyRef) return null
  return (
    <Chip title={`${policyRef.kind ?? 'RolloutPolicy'} (${policyRef.progression})`}>
      {policyRef.name}
    </Chip>
  )
}

function Digest({ digest }: { digest?: string }) {
  if (!digest) return <span className="text-muted-foreground">-</span>
  return (
    <span className="font-mono text-xs" title={digest}>
      {digest.length > 20 ? `${digest.slice(0, 20)}…` : digest}
    </span>
  )
}

function TargetRevisionsTable({ targets }: { targets: RolloutRunTarget[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th className={headerClass}>Component</th>
          <th className={headerClass}>Target revision</th>
          <th className={headerClass}>Stable revision</th>
        </tr>
      </thead>
      <tbody>
        {targets.map((target) => (
          <tr key={target.component} className="border-t border-border">
            <td className={`${cellClass} font-medium`}>{componentLabel(target.component)}</td>
            <td className={cellClass}>
              <Revision name={target.revision} />
            </td>
            <td className={cellClass}>
              <Revision name={target.stableRevision} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CanaryStepsTable({
  steps,
  currentStep,
}: {
  steps: RolloutGroupStep[]
  currentStep?: number
}) {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th className={headerClass}>Step</th>
          <th className={headerClass}>Capacity</th>
          <th className={headerClass}>Traffic</th>
          <th className={headerClass}>Gate</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, index) => {
          const state =
            currentStep === undefined
              ? undefined
              : index < currentStep
                ? 'done'
                : index === currentStep
                  ? 'current'
                  : 'pending'
          return (
            <tr
              key={index}
              className={`border-t border-border ${state === 'current' ? 'bg-accent/5' : ''}`}
              data-step-state={state}
            >
              <td className={`${cellClass} whitespace-nowrap`}>
                {index + 1}
                {state === 'current' && (
                  <Chip tone="accent" className="ml-2">
                    current
                  </Chip>
                )}
                {state === 'done' && (
                  <Chip tone="success" className="ml-2">
                    done
                  </Chip>
                )}
              </td>
              <td className={cellClass}>{String(step.capacity)}</td>
              <td className={cellClass}>{step.traffic}%</td>
              <td className={`${cellClass} text-muted-foreground`}>{gateOf(step)}</td>
            </tr>
          )
        })}
        {currentStep !== undefined && currentStep >= steps.length && (
          <tr className="border-t border-border">
            <td colSpan={4} className={`${cellClass} text-muted-foreground`}>
              All {steps.length} steps completed.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function MetricResultsTable({ results }: { results: AnalysisMetricResult[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th className={headerClass}>Metric</th>
          <th className={headerClass}>Value</th>
          <th className={headerClass}>Condition</th>
          <th className={headerClass}>Result</th>
          <th className={headerClass}>Sampled</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => (
          <tr key={result.name} className="border-t border-border">
            <td className={`${cellClass} font-medium`}>{result.name}</td>
            <td className={`${cellClass} font-mono text-xs`}>{result.value || '-'}</td>
            <td className={`${cellClass} font-mono text-xs`}>
              {result.operator || result.threshold
                ? `${result.operator ?? ''} ${result.threshold ?? ''}`.trim()
                : '-'}
            </td>
            <td className={cellClass}>
              <Chip tone={result.passed ? 'success' : 'destructive'}>
                {result.passed ? 'passed' : 'failed'}
              </Chip>
              {result.message && (
                <div className="mt-1 text-xs text-muted-foreground">{result.message}</div>
              )}
            </td>
            <td className={`${cellClass} whitespace-nowrap text-muted-foreground`}>
              {formatTimestamp(result.time)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActiveRunSection({
  run,
  components,
}: {
  run: RolloutRun
  components: Record<string, ComponentStatusSpec>
}) {
  const groups = run.plan.groups ?? []
  return (
    <section aria-label="Active run" className="space-y-4">
      <h3 className="text-sm font-medium">Active run</h3>
      <FieldGrid columns={3}>
        <Field label="Run ID">
          <span className="font-mono text-xs">{run.runID}</span>
        </Field>
        <Field label="Opened">{formatTimestamp(run.openedAt)}</Field>
        <Field label="Pinned">{formatTimestamp(run.pinnedAt)}</Field>
      </FieldGrid>
      {run.targetRevisions && run.targetRevisions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <TargetRevisionsTable targets={run.targetRevisions} />
        </div>
      )}
      {groups.length > 0 && (
        <ol className="space-y-3">
          {groups.map((pinned, index) => {
            const group = pinned.group
            const entry = group.components.find((name) => components[name]?.canary)
            const canary = entry ? components[entry]?.canary : undefined
            return (
              <li key={index} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Group {index + 1}</span>
                  <Chip tone="accent">{progressionOf(group)}</Chip>
                  {group.components.map((name) => (
                    <Chip key={name}>{name}</Chip>
                  ))}
                  <span className="text-xs text-muted-foreground">source {pinned.source}</span>
                  <PolicyRefChip policyRef={pinned.policyRef} />
                  {pinned.policyGeneration !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      generation {pinned.policyGeneration}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    digest <Digest digest={pinned.portableDigest} />
                  </span>
                  {group.soak && (
                    <span className="text-xs text-muted-foreground">soak {group.soak}</span>
                  )}
                </div>
                {!canary && group.canary?.steps && group.canary.steps.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <CanaryStepsTable steps={group.canary.steps} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function LastRunSection({ run }: { run: RolloutRunRecord }) {
  return (
    <section aria-label="Last run" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Last run <StatusBadge state={run.outcome} size="sm" />
      </h3>
      <FieldGrid columns={3}>
        <Field label="Opened">{formatTimestamp(run.openedAt)}</Field>
        <Field label="Closed">{formatTimestamp(run.closedAt)}</Field>
        <Field label="Groups">
          {run.groups && run.groups.length > 0 ? (
            <ul className="space-y-1">
              {run.groups.map((group, index) => (
                <li key={index} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span>
                    {index + 1}. {group.source}
                  </span>
                  <PolicyRefChip policyRef={group.policyRef} />
                  <Digest digest={group.portableDigest} />
                </li>
              ))}
            </ul>
          ) : (
            '-'
          )}
        </Field>
      </FieldGrid>
      {run.targetRevisions && run.targetRevisions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <TargetRevisionsTable targets={run.targetRevisions} />
        </div>
      )}
    </section>
  )
}

function ResolutionSection({ groups }: { groups: RolloutGroupResolution[] }) {
  return (
    <section aria-label="Plan resolution" className="space-y-3">
      <h3 className="text-sm font-medium">Plan resolution</h3>
      <p className="text-xs text-muted-foreground">
        What a run opened now would pin for each group of spec.rollout.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={headerClass}>Group</th>
              <th className={headerClass}>Source</th>
              <th className={headerClass}>Policy</th>
              <th className={headerClass}>Observed digest</th>
              <th className={headerClass}>Shadowed policy</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.index} className="border-t border-border">
                <td className={cellClass}>{group.index + 1}</td>
                <td className={cellClass}>{group.source}</td>
                <td className={cellClass}>
                  <PolicyRefChip policyRef={group.policyRef} />
                  {!group.policyRef && '-'}
                </td>
                <td className={cellClass}>
                  <Digest digest={group.observedDigest} />
                </td>
                <td className={cellClass}>
                  {group.shadowedPolicyRef?.name ? (
                    <span title={group.shadowedPolicyRef.wouldPinDigest}>
                      {group.shadowedPolicyRef.name}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CoordinationSection({ groups }: { groups: RolloutCoordinationGroupStatus[] }) {
  return (
    <section aria-label="Coordination groups" className="space-y-3">
      <h3 className="text-sm font-medium">Coordination groups</h3>
      <ul className="space-y-2">
        {groups.map((group, index) => (
          <li key={group.name ?? index} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Group {group.name ?? index + 1}</span>
              <StatusBadge state={group.phase} size="sm" />
              {group.policy && <Chip>{group.policy}</Chip>}
              {group.components?.map((name) => (
                <Chip key={name}>{name}</Chip>
              ))}
              {group.compositePhase && (
                <span className="font-mono text-xs text-muted-foreground">
                  {group.compositePhase}
                </span>
              )}
              {group.currentComponent && (
                <span className="text-xs text-muted-foreground">
                  reconciling {group.currentComponent}
                </span>
              )}
              {group.observedSurge !== undefined && group.observedSurge !== '' && (
                <span className="text-xs text-muted-foreground">
                  surge {String(group.observedSurge)}
                </span>
              )}
              {group.lastTransitionTime && (
                <span className="text-xs text-muted-foreground">
                  since {formatTimestamp(group.lastTransitionTime)}
                </span>
              )}
            </div>
            {group.message && <p className="mt-2 text-sm break-words">{group.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CanarySection({
  component,
  status,
  canary,
  steps,
}: {
  component: string
  status: ComponentStatusSpec
  canary: CanaryStatus
  steps?: RolloutGroupStep[]
}) {
  return (
    <section aria-label={`${componentLabel(component)} canary`} className="space-y-3">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {componentLabel(component)} canary
        {status.rolloutPhase && <StatusBadge state={status.rolloutPhase} size="sm" />}
        {canary.targetID && (
          <span className="font-mono text-xs font-normal text-muted-foreground">
            target {canary.targetID}
          </span>
        )}
      </h3>
      <FieldGrid columns={4}>
        <Field label="Canary revision">
          <Revision name={canary.canaryRevisionHash} />
        </Field>
        <Field label="Stable revision">
          <Revision name={canary.stableRevisionHash} />
        </Field>
        <Field label="Step">
          {steps
            ? `${Math.min(canary.currentStep, steps.length)} of ${steps.length}`
            : canary.currentStep}
        </Field>
        <Field label="Traffic weight">{canary.observedTrafficWeight}%</Field>
        <Field label="Step entered">{formatTimestamp(canary.stepEnteredTime)}</Field>
        <Field label="Promoted through">
          {canary.promotedThrough ? <Revision name={canary.promotedThrough} /> : '-'}
        </Field>
        <Field label="Holds">
          {[
            canary.preStepHold && 'pre-step hold',
            canary.rollbackRequested && 'rollback requested',
            canary.capacityWaitSince &&
              `capacity wait since ${formatTimestamp(canary.capacityWaitSince)}`,
          ]
            .filter(Boolean)
            .join(', ') || '-'}
        </Field>
        <Field label="Outcome">
          {canary.failed ? (
            <span className="text-destructive">
              Failed: {canary.failed.reason}
              {canary.failed.time && ` at ${formatTimestamp(canary.failed.time)}`}
            </span>
          ) : canary.rolledBackRevisionHash ? (
            <span>
              Rolled back <Revision name={canary.rolledBackRevisionHash} />
            </span>
          ) : (
            '-'
          )}
        </Field>
        {canary.analysisFailedChecks !== undefined && (
          <Field label="Failed analysis checks">{canary.analysisFailedChecks}</Field>
        )}
        {canary.lastEvaluationTime && (
          <Field label="Last evaluation" title={canary.lastConclusiveEvaluationTime}>
            {formatTimestamp(canary.lastEvaluationTime)}
          </Field>
        )}
      </FieldGrid>
      {steps && steps.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <CanaryStepsTable steps={steps} currentStep={canary.currentStep} />
        </div>
      )}
      {canary.metricResults && canary.metricResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <MetricResultsTable results={canary.metricResults} />
        </div>
      )}
    </section>
  )
}

/** The canary steps that govern a component: from the pinned plan during a run, else the spec. */
function stepsFor(
  component: string,
  activeRun: RolloutRun | undefined,
  rolloutSpec: RolloutSpec | undefined
): RolloutGroupStep[] | undefined {
  const pinned = activeRun?.plan.groups?.find((g) => g.group.components.includes(component))
  if (pinned?.group.canary?.steps) return pinned.group.canary.steps
  const declared = rolloutSpec?.groups?.find((g) => g.components.includes(component))
  return declared?.canary?.steps
}

/**
 * The rollout run model: the pinned active run and its plan, the last run, per-group resolution,
 * coordination groups, canary step machines with their analysis results, and plan drift.
 */
export function RolloutPanel({ status, rolloutSpec }: RolloutPanelProps) {
  if (!hasRolloutStatus(status) || !status) return null
  const rollout = status.rollout
  const components = status.components ?? {}
  const drift = findCondition(status.conditions, 'RolloutPlanDrift')
  const coordination = status.rolloutCoordination?.groups ?? []
  const canaries = sortComponents(Object.keys(components)).filter((name) => components[name].canary)

  return (
    <Panel
      title="Rollout"
      description="status.rollout, status.rolloutCoordination and the components' canary state"
    >
      <div className="space-y-8">
        {drift?.status === 'True' && (
          <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4">
            <p className="text-sm font-medium text-warning">Rollout plan drift</p>
            <p className="mt-1 text-sm">
              {drift.reason && <span className="font-medium">{drift.reason}: </span>}
              {drift.message || 'The pinned plan differs from what the spec would pin now.'}
            </p>
          </div>
        )}

        {rollout?.activeRun ? (
          <ActiveRunSection run={rollout.activeRun} components={components} />
        ) : (
          rollout && <p className="text-sm text-muted-foreground">No rollout run is open.</p>
        )}

        {rollout?.lastRun && <LastRunSection run={rollout.lastRun} />}
        {rollout?.groups && rollout.groups.length > 0 && (
          <ResolutionSection groups={rollout.groups} />
        )}
        {coordination.length > 0 && <CoordinationSection groups={coordination} />}
        {canaries.map((name) => (
          <CanarySection
            key={name}
            component={name}
            status={components[name]}
            canary={components[name].canary as CanaryStatus}
            steps={stepsFor(name, rollout?.activeRun, rolloutSpec)}
          />
        ))}
      </div>
    </Panel>
  )
}
