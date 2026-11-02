/**
 * Builders and parsers for the storage URI schemes whose shape the console checks before OME
 * does. They mirror ome/pkg/utils/storage/storage.go (ParsePVCStorageURI,
 * ParseModelPackStorageURI) and the kind rules in ome/pkg/validation/basemodel.go.
 */

export const PVC_URI_PREFIX = 'pvc://'
export const MODELPACK_URI_PREFIX = 'modelpack://'

/** Schemes OME v1.3 accepts but has no downloader for: such a model stays In_Transit. */
export const NO_DOWNLOADER_SCHEMES = ['s3', 'az', 'gs', 'github'] as const

/** Schemes whose weights the model agent places under `storage.path` on each selected node. */
export const NODE_PATH_SCHEMES = ['hf', 'oci', 'modelpack', 'local'] as const

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const fail = (error: string): ParseResult<never> => ({ ok: false, error })

/** The scheme of a storage URI ("pvc" for "pvc://..."), or '' when there is none. */
export function storageUriScheme(uri: string): string {
  const idx = uri.indexOf('://')
  return idx > 0 ? uri.slice(0, idx) : ''
}

const schemeOf = (uriOrScheme: string) =>
  uriOrScheme.includes('://') ? storageUriScheme(uriOrScheme) : uriOrScheme

export function hasNoDownloader(uriOrScheme: string): boolean {
  return (NO_DOWNLOADER_SCHEMES as readonly string[]).includes(schemeOf(uriOrScheme))
}

export function needsNodePath(uriOrScheme: string): boolean {
  return (NODE_PATH_SCHEMES as readonly string[]).includes(schemeOf(uriOrScheme))
}

// PVC: pvc://{pvc-name}/{sub-path} for a BaseModel, pvc://{namespace}:{pvc-name}/{sub-path} for a
// ClusterBaseModel (storage.go ParsePVCStorageURI; basemodel.go ValidatePVCStorage).

export interface PvcUriParts {
  /** The claim's namespace; present only in the ClusterBaseModel form. */
  namespace?: string
  pvcName: string
  subPath: string
}

// storage.go isValidNamespace: lowercase alphanumerics and hyphens, 1-63 chars, no edge hyphen.
const NAMESPACE_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function buildPvcUri({ namespace, pvcName, subPath }: PvcUriParts): string {
  if (!pvcName || !subPath) return ''
  const claim = namespace ? `${namespace}:${pvcName}` : pvcName
  return `${PVC_URI_PREFIX}${claim}/${subPath}`
}

export function parsePvcUri(uri: string): ParseResult<PvcUriParts> {
  if (!uri.startsWith(PVC_URI_PREFIX)) return fail(`missing ${PVC_URI_PREFIX} prefix`)
  const path = uri.slice(PVC_URI_PREFIX.length)
  if (!path) return fail('missing content after prefix')

  const slash = path.indexOf('/')
  if (slash === -1) return fail('missing sub-path')
  const claim = path.slice(0, slash)
  const subPath = path.slice(slash + 1)

  let namespace: string | undefined
  let pvcName = claim
  const colon = claim.indexOf(':')
  if (colon !== -1) {
    namespace = claim.slice(0, colon)
    pvcName = claim.slice(colon + 1)
    if (!namespace) return fail('empty namespace before colon')
    if (!pvcName) return fail('empty PVC name after colon')
    if (pvcName.includes(':')) return fail('multiple colons not allowed in namespace:pvc-name')
    if (!NAMESPACE_RE.test(namespace)) {
      return fail(
        `invalid namespace "${namespace}" (must be lowercase alphanumeric with hyphens, max 63 chars)`
      )
    }
  } else if (!pvcName) {
    return fail('missing PVC name')
  }

  if (!subPath) return fail('missing sub-path')
  if (subPath.split('/').includes('..')) return fail("sub-path must not contain '..' segments")

  return { ok: true, value: namespace ? { namespace, pvcName, subPath } : { pvcName, subPath } }
}

// ModelPack: modelpack://{registry}/{repository}[:{tag}|@{digest}] (storage.go
// ParseModelPackStorageURI). The repository can contain slashes; the registry can carry a port.

export interface ModelPackUriParts {
  registry: string
  repository: string
  tag?: string
  digest?: string
}

// OCI distribution spec grammar for tags and digests.
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/
const DIGEST_RE = /^[a-z0-9]+(?:[.+_-][a-z0-9]+)*:[A-Za-z0-9=_-]+$/

export function buildModelPackUri({
  registry,
  repository,
  tag,
  digest,
}: ModelPackUriParts): string {
  if (!registry || !repository) return ''
  return `${MODELPACK_URI_PREFIX}${registry}/${repository}${tag ? `:${tag}` : ''}${
    digest ? `@${digest}` : ''
  }`
}

/**
 * Reads one "tag or digest" field: a digest carries a colon (sha256:...), a tag cannot.
 * Empty means neither, which pulls the registry's default tag.
 */
export function modelPackReference(reference: string): Pick<ModelPackUriParts, 'tag' | 'digest'> {
  const value = reference.trim()
  if (!value) return {}
  return value.includes(':') ? { digest: value } : { tag: value }
}

export function parseModelPackUri(uri: string): ParseResult<ModelPackUriParts> {
  if (!uri.startsWith(MODELPACK_URI_PREFIX)) return fail(`missing ${MODELPACK_URI_PREFIX} prefix`)
  const reference = uri.slice(MODELPACK_URI_PREFIX.length).trim()
  const shape = 'expected modelpack://{registry}/{repository}[:{tag}|@{digest}]'

  const slash = reference.indexOf('/')
  if (slash === -1) return fail(shape)
  const registry = reference.slice(0, slash)
  const rest = reference.slice(slash + 1)
  if (!registry || !rest) return fail(shape)
  if (/\s/.test(reference)) return fail('whitespace is not allowed')

  const at = rest.indexOf('@')
  const digest = at === -1 ? undefined : rest.slice(at + 1)
  const repoAndTag = at === -1 ? rest : rest.slice(0, at)
  // A tag follows the last path segment; the registry port was split off with the registry.
  const colon = repoAndTag.indexOf(':', repoAndTag.lastIndexOf('/') + 1)
  const repository = colon === -1 ? repoAndTag : repoAndTag.slice(0, colon)
  const tag = colon === -1 ? undefined : repoAndTag.slice(colon + 1)

  if (!repository) return fail(shape)
  if (tag !== undefined && !TAG_RE.test(tag)) return fail(`invalid tag "${tag}"`)
  if (digest !== undefined && !DIGEST_RE.test(digest)) {
    return fail(`invalid digest "${digest}" (expected algorithm:encoded, such as sha256:...)`)
  }

  return {
    ok: true,
    value: { registry, repository, ...(tag && { tag }), ...(digest && { digest }) },
  }
}

/**
 * What OME's webhook would reject in a storage URI for a model of this kind, or null. Only the
 * schemes with a shape rule are checked; the rest are accepted as typed.
 */
export function storageUriIssue(uri: string, clusterScoped: boolean): string | null {
  switch (storageUriScheme(uri)) {
    case 'pvc': {
      const parsed = parsePvcUri(uri)
      if (!parsed.ok) return `Invalid PVC storage URI: ${parsed.error}`
      if (clusterScoped && !parsed.value.namespace) {
        return "A ClusterBaseModel PVC URI must name the claim's namespace: pvc://{namespace}:{pvc-name}/{sub-path}"
      }
      if (!clusterScoped && parsed.value.namespace) {
        return "A BaseModel PVC URI must not name a namespace; the model's own namespace is used: pvc://{pvc-name}/{sub-path}"
      }
      return null
    }
    case 'modelpack': {
      const parsed = parseModelPackUri(uri)
      return parsed.ok ? null : `Invalid ModelPack storage URI: ${parsed.error}`
    }
    default:
      return null
  }
}
