import { useQuery } from '@tanstack/react-query'
import { capabilitiesApi, type Capabilities } from '../api/capabilities'

export const CAPABILITIES_QUERY_KEY = ['capabilities'] as const

/**
 * The cluster's OME capabilities. Discovery runs once when the backend starts, so the result
 * never goes stale within a session.
 */
export function useCapabilities() {
  return useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: capabilitiesApi.get,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export type CapabilityCheck = { resource: string } | { feature: string }

/**
 * Whether a resource or feature is available. Unknown (still loading, or the backend could not
 * be reached) counts as available, so a capability gate never hides what the data hooks will
 * report on their own.
 */
export function isCapabilityAvailable(
  capabilities: Capabilities | undefined,
  check: CapabilityCheck
): boolean {
  if (!capabilities) return true
  if ('resource' in check) return capabilities.resources[check.resource] !== false
  return capabilities.features[check.feature] !== false
}

export function useCapability(check: CapabilityCheck): {
  available: boolean
  isLoading: boolean
  capabilities?: Capabilities
} {
  const { data, isLoading } = useCapabilities()
  return { available: isCapabilityAvailable(data, check), isLoading, capabilities: data }
}
