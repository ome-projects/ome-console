import Link from 'next/link'
import type { InferenceService } from '@/lib/types/service'
import {
  conditionReason,
  findCondition,
  formatTimestamp,
  readyState,
  resourceHref,
} from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { Chip } from '@/components/ui/Chip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CopyButton } from '@/components/ui/CopyButton'
import { ConditionsTable } from '@/components/ui/ConditionsTable'
import { MetadataCollapsible } from '@/components/ui/MetadataCollapsible'
import { Revision } from './Revision'

interface ServiceOverviewProps {
  service: InferenceService
}

/** Link to the referenced model: namespaced for a BaseModel, cluster-scoped otherwise. */
export function modelHref(service: InferenceService): string | undefined {
  const model = service.spec.model
  if (!model?.name) return undefined
  return resourceHref('/models', {
    metadata: {
      name: model.name,
      namespace: model.kind === 'BaseModel' ? service.metadata.namespace : undefined,
    },
  })
}

/** Link to the referenced runtime: namespaced for a ServingRuntime, cluster-scoped otherwise. */
export function runtimeHref(service: InferenceService): string | undefined {
  const runtime = service.spec.runtime
  if (!runtime?.name) return undefined
  return resourceHref('/runtimes', {
    metadata: {
      name: runtime.name,
      namespace: runtime.kind === 'ServingRuntime' ? service.metadata.namespace : undefined,
    },
  })
}

const linkClass = 'font-medium text-primary hover:text-primary/80 transition-colors'

/** Identity, readiness, model, runtime and conditions of a service. */
export function ServiceOverview({ service }: ServiceOverviewProps) {
  const { metadata, spec, status } = service
  const conditions = status?.conditions
  const ready = findCondition(conditions, 'Ready')
  const model = spec.model
  const runtime = spec.runtime
  const placement = status?.placement
  const modelLink = modelHref(service)
  const runtimeLink = runtimeHref(service)

  return (
    <Panel title="Overview">
      <FieldGrid columns={3}>
        <Field label="Name">
          <span className="font-medium">{metadata.name}</span>
        </Field>
        <Field label="Namespace">
          <Chip>{metadata.namespace || 'default'}</Chip>
        </Field>
        <Field label="Ready">
          <div className="flex flex-col items-start gap-1">
            <StatusBadge
              state={readyState(conditions)}
              size="sm"
              title={conditionReason(conditions, 'Ready')}
            />
            {(ready?.reason || ready?.message) && (
              <span className="text-xs text-muted-foreground break-words">
                {ready.reason}
                {ready.reason && ready.message ? ': ' : ''}
                {ready.message}
              </span>
            )}
          </div>
        </Field>
        <Field label="URL">
          {status?.url ? (
            <span className="inline-flex max-w-full items-start gap-1">
              <a
                href={status.url}
                className="break-all font-mono text-xs text-primary hover:text-primary/80"
              >
                {status.url}
              </a>
              <CopyButton text={status.url} />
            </span>
          ) : (
            <span className="text-muted-foreground">not addressable yet</span>
          )}
        </Field>
        <Field label="Model">
          {model?.name ? (
            <div className="flex flex-col items-start gap-1">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {modelLink ? (
                  <Link href={modelLink} className={linkClass}>
                    {model.name}
                  </Link>
                ) : (
                  model.name
                )}
                {model.kind && <Chip title={`spec.model.kind`}>{model.kind}</Chip>}
              </span>
              {model.fineTunedWeights && model.fineTunedWeights.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Fine-tuned weights: {model.fineTunedWeights.join(', ')}
                </span>
              )}
              {model.overlays && model.overlays.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Overlays: {model.overlays.map((overlay) => overlay.name).join(', ')}
                </span>
              )}
            </div>
          ) : spec.replicaRefs ? (
            <span className="text-muted-foreground" title="spec.replicaRefs">
              carried by the referenced replicas
            </span>
          ) : (
            '-'
          )}
        </Field>
        <Field label="Runtime">
          {runtime?.name ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {runtimeLink ? (
                <Link href={runtimeLink} className={linkClass}>
                  {runtime.name}
                </Link>
              ) : (
                runtime.name
              )}
              {runtime.kind && <Chip title="spec.runtime.kind">{runtime.kind}</Chip>}
              {runtime.autoSync === false && (
                <Chip tone="warning" title="spec.runtime.autoSync is false">
                  pinned
                </Chip>
              )}
              {runtime.revision && (
                <Chip mono title="spec.runtime.revision">
                  {runtime.revision}
                </Chip>
              )}
            </span>
          ) : spec.replicaRefs ? (
            <span className="text-muted-foreground" title="spec.replicaRefs">
              carried by the referenced replicas
            </span>
          ) : (
            <span className="italic" title="OME selects the runtime from the model">
              auto
            </span>
          )}
        </Field>
        <Field label="Deployment mode">
          <Chip>{spec.deploymentMode || 'RawDeployment'}</Chip>
        </Field>
        <Field label="Created">{formatTimestamp(metadata.creationTimestamp)}</Field>
        {status?.pinnedRevisionName && (
          <Field label="Pinned revision" title="status.pinnedRevisionName">
            <Revision name={status.pinnedRevisionName} />
          </Field>
        )}
        {placement?.phase && (
          <Field label="Placement">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <StatusBadge state={placement.phase} size="sm" />
              {placement.cluster && <Chip mono>{placement.cluster}</Chip>}
            </span>
            {placement.endpoint && (
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {placement.endpoint}
              </div>
            )}
          </Field>
        )}
      </FieldGrid>

      <div className="mt-6">
        <MetadataCollapsible labels={metadata.labels} annotations={metadata.annotations} />
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium">
          Conditions{conditions && conditions.length > 0 ? ` (${conditions.length})` : ''}
        </h3>
        <ConditionsTable
          conditions={conditions}
          emptyMessage="The controller has not reported conditions yet."
        />
      </div>
    </Panel>
  )
}
