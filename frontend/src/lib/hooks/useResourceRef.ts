import { useParams, useSearchParams } from 'next/navigation'
import type { ResourceRef } from '../api/createResourceApi'

/**
 * The object a detail or edit page is about: the `[name]` route segment plus the optional
 * `?namespace=` query, which namespaced objects carry in their links.
 */
export function useResourceRef(): ResourceRef {
  const params = useParams()
  const searchParams = useSearchParams()
  const raw = params?.name
  const name = Array.isArray(raw) ? raw[0] : (raw ?? '')
  const namespace = searchParams?.get('namespace') || undefined
  return { name, namespace }
}
