import { servicesApi } from '../api/services'
import { InferenceService } from '../types/service'
import { createResourceHooks } from './createResourceHooks'

const RESOURCE_KEY = 'services'

const serviceHooks = createResourceHooks<
  InferenceService,
  Partial<InferenceService>,
  Partial<InferenceService>
>(servicesApi, { resourceKey: RESOURCE_KEY })

/** Lists services; without a namespace, across all namespaces. */
export const useServices = serviceHooks.useList
/** One service; InferenceServices are namespaced, so pass the namespace. */
export const useService = serviceHooks.useGet
export const useCreateService = serviceHooks.useCreate
/** Mutation input: `{ name, namespace, data }`. */
export const useUpdateService = serviceHooks.useUpdate
/** Mutation input: `{ name, namespace }`. */
export const useDeleteService = serviceHooks.useDelete
