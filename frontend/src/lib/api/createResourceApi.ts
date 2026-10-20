import { apiClient } from './client'
import { ListResponse } from '../types/common'

/** Identifies one object; namespace is required for namespaced resources. */
export interface ResourceRef {
  name: string
  namespace?: string
}

export interface WriteOptions {
  /** Ask the API server to validate (schema, CEL rules, webhooks) without persisting. */
  dryRun?: boolean
}

export interface ResourceApi<T, C = Partial<T>, U = Partial<T>> {
  /** Lists objects; without a namespace a namespaced resource is listed across all namespaces. */
  list: (namespace?: string) => Promise<ListResponse<T>>
  get: (name: string, namespace?: string) => Promise<T>
  /** The namespace comes from the argument, else from `metadata.namespace` in the body. */
  create: (data: C, namespace?: string, options?: WriteOptions) => Promise<T>
  update: (name: string, data: U, namespace?: string, options?: WriteOptions) => Promise<T>
  delete: (name: string, namespace?: string) => Promise<void>
}

export interface GeneratedResourceApi<T, C = Partial<T>, U = Partial<T>> extends ResourceApi<
  T,
  C,
  U
> {
  /** Path of the collection for a namespace, e.g. `/namespaces/team-a/services`. */
  collectionPath: (namespace?: string) => string
  objectPath: (name: string, namespace?: string) => string
  getStatus: (name: string, namespace?: string) => Promise<{ status: Record<string, unknown> }>
  /** JSON patch (array body) or merge patch (object body). */
  patch: (
    name: string,
    patch: unknown[] | Record<string, unknown>,
    namespace?: string,
    options?: WriteOptions
  ) => Promise<T>
}

interface ObjectLike {
  metadata?: { namespace?: string }
}

/**
 * Builds the client for one backend resource. The backend serves cluster-scoped resources at
 * `/<key>` and namespaced ones at `/namespaces/<ns>/<key>`, with `/<key>` listing across
 * namespaces. Single-object calls on a namespaced resource need the namespace; the backend
 * answers 400 otherwise, so this client fails early with a clear message.
 */
export function createResourceApi<T, C = Partial<T>, U = Partial<T>>(
  key: string,
  { namespaced }: { namespaced: boolean }
): GeneratedResourceApi<T, C, U> {
  const collectionPath = (namespace?: string) =>
    namespaced && namespace ? `/namespaces/${encodeURIComponent(namespace)}/${key}` : `/${key}`

  const objectPath = (name: string, namespace?: string) => {
    if (namespaced && !namespace) {
      throw new Error(`${key} is namespaced: a namespace is required for ${name}`)
    }
    return `${collectionPath(namespace)}/${encodeURIComponent(name)}`
  }

  const params = (options?: WriteOptions) => (options?.dryRun ? { dryRun: 'true' } : undefined)

  return {
    collectionPath,
    objectPath,

    list: async (namespace) => {
      const response = await apiClient.get<ListResponse<T>>(collectionPath(namespace))
      return response.data
    },

    get: async (name, namespace) => {
      const response = await apiClient.get<T>(objectPath(name, namespace))
      return response.data
    },

    getStatus: async (name, namespace) => {
      const response = await apiClient.get<{ status: Record<string, unknown> }>(
        `${objectPath(name, namespace)}/status`
      )
      return response.data
    },

    create: async (data, namespace, options) => {
      const ns = namespace ?? (data as ObjectLike)?.metadata?.namespace
      const response = await apiClient.post<T>(collectionPath(ns), data, {
        params: params(options),
      })
      return response.data
    },

    update: async (name, data, namespace, options) => {
      const ns = namespace ?? (data as ObjectLike)?.metadata?.namespace
      const response = await apiClient.put<T>(objectPath(name, ns), data, {
        params: params(options),
      })
      return response.data
    },

    patch: async (name, patch, namespace, options) => {
      const contentType = Array.isArray(patch)
        ? 'application/json-patch+json'
        : 'application/merge-patch+json'
      const response = await apiClient.patch<T>(objectPath(name, namespace), patch, {
        params: params(options),
        headers: { 'Content-Type': contentType },
      })
      return response.data
    },

    delete: async (name, namespace) => {
      await apiClient.delete(objectPath(name, namespace))
    },
  }
}
