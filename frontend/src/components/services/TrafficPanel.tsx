import type { TrafficStatus } from '@/lib/types/generated/ome.v1beta1'
import { Panel } from '@/components/ui/Panel'
import { Field, FieldGrid } from '@/components/ui/Fields'
import { Chip } from '@/components/ui/Chip'
import { ConditionsTable } from '@/components/ui/ConditionsTable'

interface TrafficPanelProps {
  /** `status.traffic`; absent until the service declares traffic intent. */
  traffic?: TrafficStatus
}

/** The resolved load-balancing policy and the backend policy resource OME emitted for it. */
export function TrafficPanel({ traffic }: TrafficPanelProps) {
  if (!traffic) return null
  const policy = traffic.backendPolicyResource
  const routes = traffic.targetedHTTPRoutes ?? []

  return (
    <Panel
      title="Traffic policy"
      description="status.traffic: the load-balancing policy applied to the service's routes"
    >
      <FieldGrid columns={3}>
        <Field label="Algorithm">{traffic.algorithm || '-'}</Field>
        <Field label="Backend policy" title={policy?.apiVersion}>
          {policy ? (
            <span className="font-mono text-xs">
              {policy.kind}/{policy.name}
            </span>
          ) : (
            <span className="text-muted-foreground">none emitted</span>
          )}
        </Field>
        <Field label="Targeted routes">
          {routes.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {routes.map((route) => (
                <Chip key={route} mono>
                  {route}
                </Chip>
              ))}
            </span>
          ) : (
            '-'
          )}
        </Field>
      </FieldGrid>
      {traffic.conditions && traffic.conditions.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium">Conditions</h3>
          <ConditionsTable conditions={traffic.conditions} />
        </div>
      )}
    </Panel>
  )
}
