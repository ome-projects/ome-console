import { useQuery, type QueryKey } from '@tanstack/react-query'
import {
  serviceReplicasApi,
  type DecodedServiceReplica,
  type ServiceReplicasResponse,
} from '../api/serviceReplicas'
import { DEFAULT_QUERY_CONFIG } from './createResourceHooks'

/** How often to refetch while an instance or a migration is still converging. */
export const CONVERGING_REFETCH_MS = 5000

/** Migration phases after which the record is history rather than work. */
const TERMINAL_MIGRATION_PHASES = new Set(['Completed', 'Failed', 'Relocated'])

/**
 * The key starts with `replicas` so the Server-Sent Events for InferenceReplicas refresh the
 * decoded rows along with the plain objects.
 */
export const serviceInstancesQueryKey = (namespace?: string, name?: string): QueryKey => [
  'replicas',
  namespace,
  'service',
  name,
  'instances',
]

/** True while any instance is not Ready or any migration is still in flight. */
export function isConverging(items: DecodedServiceReplica[]): boolean {
  return items.some(
    (item) =>
      item.instances.some((instance) => instance.phase !== 'Ready') ||
      (item.replica.status?.migrations ?? []).some(
        (migration) => !TERMINAL_MIGRATION_PHASES.has(migration.phase)
      )
  )
}

/**
 * The decoded OMENative instances of a service, one entry per InferenceReplica. Polls every
 * `CONVERGING_REFETCH_MS` while something is converging; otherwise SSE events drive refreshes.
 * Pass `enabled: false` on clusters without the `omenative` capability.
 */
export function useServiceInstances(
  namespace: string | undefined,
  name: string | undefined,
  options: { enabled?: boolean } = {}
) {
  return useQuery<ServiceReplicasResponse>({
    queryKey: serviceInstancesQueryKey(namespace, name),
    queryFn: () => serviceReplicasApi.list(namespace as string, name as string),
    enabled: !!namespace && !!name && options.enabled !== false,
    staleTime: DEFAULT_QUERY_CONFIG.staleTime,
    gcTime: DEFAULT_QUERY_CONFIG.gcTime,
    retry: DEFAULT_QUERY_CONFIG.retry,
    retryDelay: DEFAULT_QUERY_CONFIG.retryDelay,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && isConverging(data.items) ? CONVERGING_REFETCH_MS : false
    },
  })
}
