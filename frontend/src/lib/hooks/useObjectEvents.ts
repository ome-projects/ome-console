import { useQuery } from '@tanstack/react-query'
import { objectEventsApi, ObjectEventsResponse, ObjectRef } from '../api/objectEvents'
import { DEFAULT_QUERY_CONFIG } from './createResourceHooks'

export const objectEventsQueryKey = ({ namespace, kind, name }: ObjectRef) => [
  'events',
  namespace,
  kind,
  name,
]

/**
 * Kubernetes events for one object. Events are not pushed over SSE, so pass a
 * `refetchInterval` while the page is watching something converge.
 */
export function useObjectEvents(
  ref: Partial<ObjectRef>,
  options: { enabled?: boolean; refetchInterval?: number } = {}
) {
  const complete = !!ref.namespace && !!ref.kind && !!ref.name
  return useQuery<ObjectEventsResponse>({
    queryKey: objectEventsQueryKey(ref as ObjectRef),
    queryFn: () => objectEventsApi.list(ref as ObjectRef),
    enabled: complete && options.enabled !== false,
    staleTime: 2000,
    gcTime: DEFAULT_QUERY_CONFIG.gcTime,
    retry: DEFAULT_QUERY_CONFIG.retry,
    retryDelay: DEFAULT_QUERY_CONFIG.retryDelay,
    refetchInterval: options.refetchInterval,
  })
}
