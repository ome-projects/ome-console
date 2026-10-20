interface ObjectRef {
  metadata: { name: string; namespace?: string }
}

/** Appends `?namespace=` to a path when the object is namespaced. */
export function withNamespace(path: string, namespace?: string): string {
  return namespace ? `${path}?namespace=${encodeURIComponent(namespace)}` : path
}

/** Link to an object's detail page, e.g. `/services/llama?namespace=team-a`. */
export function resourceHref(basePath: string, item: ObjectRef): string {
  return withNamespace(
    `${basePath}/${encodeURIComponent(item.metadata.name)}`,
    item.metadata.namespace
  )
}

/** Link to an object's edit page, e.g. `/runtimes/vllm/edit?namespace=team-a`. */
export function resourceEditHref(basePath: string, item: ObjectRef): string {
  return withNamespace(
    `${basePath}/${encodeURIComponent(item.metadata.name)}/edit`,
    item.metadata.namespace
  )
}

/** A key that is unique across namespaces, for selections and React keys. */
export function resourceKey(item: ObjectRef): string {
  return item.metadata.namespace
    ? `${item.metadata.namespace}/${item.metadata.name}`
    : item.metadata.name
}
