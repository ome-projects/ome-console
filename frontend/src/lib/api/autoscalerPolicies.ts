import { createResourceApi } from './createResourceApi'
import type { Resource } from '../types/common'
import type { AutoscalerPolicy as GeneratedAutoscalerPolicy } from '../types/generated/ome.v1beta1'

export type AutoscalerPolicy = Resource<GeneratedAutoscalerPolicy>

/**
 * AutoscalerPolicies are namespaced: `/namespaces/<ns>/autoscalerpolicies[/<name>]`. The
 * backend serves them only when the cluster has the CRD (capability `autoscalerPolicy`).
 */
export const autoscalerPoliciesApi = createResourceApi<AutoscalerPolicy>('autoscalerpolicies', {
  namespaced: true,
})
