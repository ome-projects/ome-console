import { useQuery } from '@tanstack/react-query'
import { replicasApi } from '../api/replicas'
import { INFERENCE_SERVICE_LABEL, InferenceReplica } from '../types/replica'
import { createResourceHooks, DEFAULT_QUERY_CONFIG, queryKeys } from './createResourceHooks'

const RESOURCE_KEY = 'replicas'

const replicaHooks = createResourceHooks<InferenceReplica>(replicasApi, {
  resourceKey: RESOURCE_KEY,
})

/** Lists InferenceReplicas; without a namespace, across all namespaces. */
export const useReplicas = replicaHooks.useList
/** One InferenceReplica; they are namespaced, so pass the namespace. */
export const useReplica = replicaHooks.useGet
export const useDeleteReplica = replicaHooks.useDelete

/** The replicas OME projects for a service: labelled with it, or naming it as their parent. */
export function belongsToService(replica: InferenceReplica, serviceName: string): boolean {
  return (
    replica.metadata.labels?.[INFERENCE_SERVICE_LABEL] === serviceName ||
    replica.spec.parentRef?.name === serviceName
  )
}

/**
 * The InferenceReplicas of one service (one per OMENative component). The list query shares
 * the `replicas` key, so SSE events for replicas refresh it; pass `refetchInterval` while an
 * instance is still converging.
 */
export function useServiceReplicas(
  namespace: string | undefined,
  serviceName: string | undefined,
  options: { enabled?: boolean; refetchInterval?: number } = {}
) {
  return useQuery({
    queryKey: [...queryKeys.list(RESOURCE_KEY, namespace), 'service', serviceName],
    queryFn: async () => {
      const response = await replicasApi.list(namespace)
      return response.items.filter((replica) => belongsToService(replica, serviceName ?? ''))
    },
    enabled: !!namespace && !!serviceName && options.enabled !== false,
    staleTime: DEFAULT_QUERY_CONFIG.staleTime,
    gcTime: DEFAULT_QUERY_CONFIG.gcTime,
    retry: DEFAULT_QUERY_CONFIG.retry,
    retryDelay: DEFAULT_QUERY_CONFIG.retryDelay,
    refetchInterval: options.refetchInterval,
  })
}
