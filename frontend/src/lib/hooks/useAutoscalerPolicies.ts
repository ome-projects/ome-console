import { useQuery } from '@tanstack/react-query'
import { autoscalerPoliciesApi } from '../api/autoscalerPolicies'
import { DEFAULT_QUERY_CONFIG, queryKeys } from './createResourceHooks'

const RESOURCE_KEY = 'autoscalerpolicies'

/**
 * The AutoscalerPolicies of a namespace, for `autoscalerPolicyRef` selects. Disabled without a
 * namespace or when the caller knows the cluster lacks the CRD; never retried on a 404 so a
 * backend without the route only costs one request.
 */
export function useAutoscalerPolicies(namespace?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list(RESOURCE_KEY, namespace),
    queryFn: () => autoscalerPoliciesApi.list(namespace),
    enabled: enabled && !!namespace,
    staleTime: DEFAULT_QUERY_CONFIG.staleTime,
    gcTime: DEFAULT_QUERY_CONFIG.gcTime,
    retry: DEFAULT_QUERY_CONFIG.retry,
    retryDelay: DEFAULT_QUERY_CONFIG.retryDelay,
  })
}
