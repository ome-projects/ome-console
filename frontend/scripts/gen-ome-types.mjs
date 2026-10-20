#!/usr/bin/env node
/**
 * Generates TypeScript types for the OME API from the vendored snapshot in api/ome/:
 *
 *   api/ome/swagger.json   -> one interface per definition (shape, docs, required fields)
 *   api/ome/crd-meta.json  -> string-literal unions for enum fields, and per-kind metadata
 *                             (plural, scope, short names, printer columns, subresources)
 *   api/ome/OME_VERSION    -> the OME commit recorded in the header
 *
 * Output: frontend/src/lib/types/generated/ome.v1beta1.ts, prettier-formatted. `--check`
 * verifies that the committed output is current (CI runs it).
 *
 * Types from other API groups that the snapshot references but does not define (core
 * Kubernetes, knative, KEDA) map to the console's hand-written types in src/lib/types/common.ts,
 * to `string` for values serialized as strings, or to OpaqueObject. A reference missing from
 * EXTERNAL_TYPES fails the run, so an OME bump cannot silently produce `unknown`.
 *
 * Enum paths in crd-meta.json follow the extractor's conventions (`a.b`, `items[]`, `map.*`).
 * Each is walked through the swagger from the kind's root definition to the property it belongs
 * to. A path that cannot be walked inside the OME types fails the run; paths that leave the OME
 * types (into core Kubernetes objects such as conditions or containers) are skipped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const prettier = require('prettier')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
export const API_DIR = resolve(repoRoot, 'api', 'ome')
export const OUTPUT_PATH = resolve(repoRoot, 'frontend/src/lib/types/generated/ome.v1beta1.ts')

const PREFIX = 'v1beta1.'
const REF_PREFIX = '#/definitions/'

/** How to render references to types the snapshot does not define. */
const EXTERNAL_TYPES = {
  // The console's hand-written Kubernetes types.
  'v1.ObjectMeta': { common: 'ObjectMeta' },
  'v1.ListMeta': { common: 'ListMeta' },
  'v1.Condition': { common: 'Condition' },
  'v1.Container': { common: 'Container' },
  'v1.ContainerPort': { common: 'ContainerPort' },
  'v1.EnvVar': { common: 'EnvVar' },
  'v1.LocalObjectReference': { common: 'LocalObjectReference' },
  'v1.ResourceRequirements': { common: 'ResourceRequirements' },
  'v1.SecurityContext': { common: 'SecurityContext' },
  'v1.Toleration': { common: 'Toleration' },
  'v1.Volume': { common: 'Volume' },
  'v1.VolumeMount': { common: 'VolumeMount' },
  // Serialized as strings on the wire.
  'v1.Time': { type: 'string' },
  'v1.MicroTime': { type: 'string' },
  'v1.Duration': { type: 'string' },
  'resource.Quantity': { type: 'string' },
  'knative.URL': { type: 'string' },
  'k8s.io.apimachinery.pkg.util.intstr.IntOrString': { type: 'IntOrString' },
  // Not modelled by the console; kept opaque.
  'v1.Affinity': { opaque: true },
  'v1.NodeAffinity': { opaque: true },
  'v1.PodDNSConfig': { opaque: true },
  'v1.EphemeralContainer': { opaque: true },
  'v1.HostAlias': { opaque: true },
  'v1.PodOS': { opaque: true },
  'v1.PodReadinessGate': { opaque: true },
  'v1.PodResourceClaim': { opaque: true },
  'v1.PodSchedulingGate': { opaque: true },
  'v1.PodSecurityContext': { opaque: true },
  'v1.TopologySpreadConstraint': { opaque: true },
  'v1.Probe': { opaque: true },
  'v1.Lifecycle': { opaque: true },
  'v1.EnvFromSource': { opaque: true },
  'v1.SecretKeySelector': { opaque: true },
  'v1.SecretReference': { opaque: true },
  'v1.PodTemplateSpec': { opaque: true },
  'v1.ContainerResizePolicy': { opaque: true },
  'v1.ContainerRestartRule': { opaque: true },
  'v1.VolumeDevice': { opaque: true },
  'k8s.io.api.apps.v1.DeploymentStrategy': { opaque: true },
  'k8s.io.apimachinery.pkg.runtime.RawExtension': { opaque: true },
  'k8s.io.api.autoscaling.v2.HorizontalPodAutoscalerBehavior': { opaque: true },
  'k8s.io.api.autoscaling.v2.MetricSpec': { opaque: true },
  'knative.Addressable': { opaque: true },
  'knative.Condition': { opaque: true },
  'github.com.kedacore.keda.v2.apis.keda.v1alpha1.AdvancedConfig': { opaque: true },
  'github.com.kedacore.keda.v2.apis.keda.v1alpha1.Fallback': { opaque: true },
  'github.com.kedacore.keda.v2.apis.keda.v1alpha1.ScaleTriggers': { opaque: true },
}

/** Reads the three snapshot files. */
export function loadInputs(apiDir = API_DIR) {
  const read = (name) => readFileSync(resolve(apiDir, name), 'utf8')
  return {
    swagger: JSON.parse(read('swagger.json')),
    crdMeta: JSON.parse(read('crd-meta.json')),
    version: read('OME_VERSION').split('\n')[0].trim(),
  }
}

const localName = (defName) => defName.slice(PREFIX.length)
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function refName(ref) {
  if (!ref.startsWith(REF_PREFIX)) throw new Error(`unexpected $ref ${ref}`)
  return ref.slice(REF_PREFIX.length)
}

/** Resolves a reference to a TypeScript type name, recording imports from common.ts. */
function refType(ref, ctx) {
  const name = refName(ref)
  if (name.startsWith(PREFIX)) {
    if (!ctx.defs[name]) throw new Error(`${ref} is not defined in the swagger`)
    return localName(name)
  }
  const external = EXTERNAL_TYPES[name]
  if (!external) {
    throw new Error(`no TypeScript mapping for external type ${name}; add it to EXTERNAL_TYPES`)
  }
  if (external.common) {
    ctx.imports.add(external.common)
    return external.common
  }
  if (external.type) return external.type
  return 'OpaqueObject'
}

/** Renders a swagger schema as a TypeScript type. */
function tsType(schema, ctx) {
  if (schema.$ref) return refType(schema.$ref, ctx)
  switch (schema.type) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array': {
      const item = tsType(schema.items ?? {}, ctx)
      return item.includes(' ') ? `(${item})[]` : `${item}[]`
    }
    case 'object': {
      const values = schema.additionalProperties
      if (values && typeof values === 'object') return `Record<string, ${tsType(values, ctx)}>`
      return 'OpaqueObject'
    }
    default:
      return 'unknown'
  }
}

/** Formats a description as a JSDoc block. */
function docBlock(text, indent = '') {
  if (!text) return ''
  const lines = text.replace(/\*\//g, '*\\/').trim().split('\n')
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`.trimEnd()).join('\n')}\n${indent} */\n`
}

/** Classifies what a schema points at, for walking enum paths. */
function schemaNode(schema, defs) {
  if (schema.$ref) {
    const name = refName(schema.$ref)
    if (name.startsWith(PREFIX)) {
      if (!defs[name]) throw new Error(`${schema.$ref} is not defined in the swagger`)
      return { kind: 'def', name }
    }
    return { kind: 'external' }
  }
  const values = schema.additionalProperties
  if (values && typeof values === 'object') return { kind: 'map', value: schemaNode(values, defs) }
  return { kind: 'scalar' }
}

/**
 * Walks an enum path from a kind's root definition. Returns the owning definition and property
 * (`items` when the enum applies to an array's elements), 'external' when the path leaves the
 * OME types, or null when it does not exist.
 */
export function resolveEnumPath(defs, rootDef, path) {
  const segments = path.split('.')
  let node = { kind: 'def', name: rootDef }
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const last = i === segments.length - 1
    if (segment === '*') {
      if (node.kind !== 'map') return null
      node = node.value
    } else {
      if (node.kind !== 'def') return null
      const items = segment.endsWith('[]')
      const prop = items ? segment.slice(0, -2) : segment
      const schema = defs[node.name].properties?.[prop]
      if (!schema) return null
      if (last) return { def: node.name, prop, items }
      let next = schema
      if (items) {
        if (schema.type !== 'array') return null
        next = schema.items ?? {}
      }
      node = schemaNode(next, defs)
    }
    if (node.kind === 'external') return 'external'
    if (node.kind === 'scalar') return null
  }
  return null
}

/** Attaches the CRD enums to the swagger properties they describe. */
function collectEnums(defs, crdMeta) {
  const enums = new Map()
  const invalid = []
  for (const [kind, meta] of Object.entries(crdMeta.kinds)) {
    const rootDef = PREFIX + kind
    if (!defs[rootDef]) throw new Error(`kind ${kind} from crd-meta.json has no swagger definition`)
    for (const [path, values] of Object.entries(meta.enums)) {
      const target = resolveEnumPath(defs, rootDef, path)
      if (target === 'external') continue
      if (target === null) {
        invalid.push(`${kind}: ${path}`)
        continue
      }
      const key = `${target.def}.${target.prop}`
      const existing = enums.get(key)
      if (existing && JSON.stringify(existing.values) !== JSON.stringify(values)) {
        throw new Error(`conflicting enum values for ${key}: ${existing.values} vs ${values}`)
      }
      enums.set(key, {
        owner: localName(target.def),
        prop: target.prop,
        typeName: `${localName(target.def)}${upperFirst(target.prop)}`,
        values,
        items: target.items,
      })
    }
  }
  if (invalid.length) {
    throw new Error(`enum paths not found in the swagger:\n  ${invalid.join('\n  ')}`)
  }
  return enums
}

/** Renders the per-kind metadata block. */
function renderKinds(crdMeta) {
  const kinds = Object.keys(crdMeta.kinds).sort()
  const entries = kinds.map((kind) => {
    const m = crdMeta.kinds[kind]
    const columns = m.printerColumns.map(
      (c) =>
        `{ name: ${JSON.stringify(c.name)}, jsonPath: ${JSON.stringify(c.jsonPath)}, type: ${JSON.stringify(c.type)}, priority: ${c.priority ?? 0} }`
    )
    return `  ${kind}: {
    kind: ${JSON.stringify(kind)},
    plural: ${JSON.stringify(m.plural)},
    singular: ${JSON.stringify(m.singular)},
    listKind: ${JSON.stringify(m.listKind)},
    namespaced: ${m.scope === 'Namespaced'},
    shortNames: ${JSON.stringify(m.shortNames)},
    subresources: ${JSON.stringify(m.subresources)},
    printerColumns: [${columns.join(', ')}],
  },`
  })
  const objects = kinds.map((kind) => `  ${kind}: ${kind}`)
  return `/** A column of \`kubectl get\` for a kind, from the CRD's additionalPrinterColumns. */
export interface OMEPrinterColumn {
  name: string
  jsonPath: string
  type: string
  /** 0 is shown by default; higher values only with \`-o wide\`. */
  priority: number
}

/** What the CRD says about a kind. */
export interface OMEKindMeta {
  kind: string
  plural: string
  singular: string
  listKind: string
  namespaced: boolean
  shortNames: readonly string[]
  subresources: readonly string[]
  printerColumns: readonly OMEPrinterColumn[]
}

/** CRD metadata for every OME kind, keyed by kind. */
export const omeKinds = {
${entries.join('\n')}
} as const satisfies Record<string, OMEKindMeta>

export type OMEKind = keyof typeof omeKinds

/** The object type of each OME kind. */
export interface OMEObjects {
${objects.join('\n')}
}
`
}

/** Generates the TypeScript source for the snapshot. */
export async function generate({ swagger, crdMeta, version }) {
  const defs = swagger.definitions
  const ctx = { defs, imports: new Set() }
  const enums = collectEnums(defs, crdMeta)

  const enumBlocks = [...enums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, e]) => {
      return `/** Values of \`${e.owner}.${e.prop}\`. */
export const ${e.typeName}Values = ${JSON.stringify(e.values)} as const
export type ${e.typeName} = (typeof ${e.typeName}Values)[number]
`
    })

  const interfaces = Object.keys(defs)
    .sort()
    .map((defName) => {
      const def = defs[defName]
      const name = localName(defName)
      if (!def.properties) {
        return `${docBlock(def.description)}export type ${name} = Record<string, never>\n`
      }
      const required = new Set(def.required ?? [])
      const props = Object.entries(def.properties).map(([prop, schema]) => {
        const e = enums.get(`${defName}.${prop}`)
        const type = e ? (e.items ? `${e.typeName}[]` : e.typeName) : tsType(schema, ctx)
        const key = /^[A-Za-z_$][\w$]*$/.test(prop) ? prop : JSON.stringify(prop)
        return `${docBlock(schema.description, '  ')}  ${key}${required.has(prop) ? '' : '?'}: ${type}`
      })
      return `${docBlock(def.description)}export interface ${name} {\n${props.join('\n')}\n}\n`
    })

  const imports = [...ctx.imports].sort()
  const code = `// Code generated by frontend/scripts/gen-ome-types.mjs from api/ome (OME ${version}). DO NOT EDIT.
// Regenerate with \`npm run gen:types\`; CI verifies the output with \`npm run gen:types:check\`.
/* eslint-disable */
${imports.length ? `import type { ${imports.join(', ')} } from '../common'\n` : ''}
/** A Kubernetes value the console does not model; see gen-ome-types.mjs for which types. */
export type OpaqueObject = Record<string, unknown>

/** A Kubernetes IntOrString, e.g. \`3\` or \`"25%"\`. */
export type IntOrString = number | string

${enumBlocks.join('\n')}
${interfaces.join('\n')}
${renderKinds(crdMeta)}`

  const config = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {}
  return prettier.format(code, { ...config, parser: 'typescript', filepath: OUTPUT_PATH })
}

async function main() {
  const check = process.argv.includes('--check')
  const code = await generate(loadInputs())
  if (check) {
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : ''
    if (current !== code) {
      console.error(`${OUTPUT_PATH} is out of date with api/ome; run \`npm run gen:types\``)
      process.exit(1)
    }
    console.log('generated OME types are up to date')
    return
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, code)
  console.log(`wrote ${OUTPUT_PATH}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
