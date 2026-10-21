import { createResourceApi } from './createResourceApi'
import { InferenceService } from '../types/service'

/**
 * InferenceServices are namespaced: `/namespaces/<ns>/services[/<name>]`, with `/services`
 * listing across namespaces.
 */
export const servicesApi = createResourceApi<InferenceService>('services', { namespaced: true })
