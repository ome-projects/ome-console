/**
 * Extract the console-relevant parts of the OME CRDs into one small JSON file.
 *
 * Usage: node frontend/scripts/extract-crd-meta.mjs <crd-dir> <out-file>
 *
 * <crd-dir> is OME's config/crd/full; every ome.io_*.yaml in it is read. The
 * output carries, per kind, what swagger.json cannot express and the console
 * needs: enums, required lists, defaults, int-or-string fields, CEL rules
 * (x-kubernetes-validations), printer columns, names, scope and subresources.
 * The full CRD YAMLs (~5 MB) are intentionally not vendored.
 *
 * Path conventions (the TypeScript generator walks these):
 *   - dotted from the object root, no leading dot:  "spec.deploymentMode"
 *   - array items are "name[]":                     "spec.rollout.groups[]"
 *   - additionalProperties values are "name.*":     "status.components.*.autoscaler.class"
 *   - the root object itself is "" (empty string), used for root-level
 *     required/cel entries
 *   - property names are used verbatim; the script refuses names containing
 *     ".", "*", "[" or "]" so a path can always be split unambiguously
 *
 * Every per-kind key is always present (empty array/map when nothing applies):
 *   group, version, plural, singular, scope, shortNames, listKind,
 *   subresources, printerColumns, enums, required, defaults, intOrString, cel
 *
 *   enums          path -> allowed values, in CRD order. controller-gen emits
 *                  the enum under allOf (once per Enum marker) when both a type
 *                  alias and a field carry one; the effective list is the
 *                  intersection of those entries, in the order of the first.
 *   required       object path -> sorted names of its required properties
 *   defaults       path -> default value, copied as-is
 *   intOrString    sorted paths carrying x-kubernetes-int-or-string
 *   cel            [{path, rule, message?, messageExpression?}] sorted by
 *                  path; rules of one path keep their CRD order
 *   printerColumns [{name, jsonPath, type, priority}] in CRD order, priority
 *                  defaulting to 0 (plus description/format when present)
 *   subresources   sorted keys of the version's subresources, e.g.
 *                  ["scale", "status"]
 *
 * The output is deterministic: object keys sorted, 2-space indent, trailing
 * newline. The schema is taken from the version marked `storage: true`.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// js-yaml is a frontend dependency; resolve it relative to this file so the
// script also works when run from the repository root.
const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const GENERATOR = 'frontend/scripts/extract-crd-meta.mjs'
const CRD_FILE = /^ome\.io_.*\.ya?ml$/

// OME's CRDs only use allOf to repeat an enum and anyOf for int-or-string. A
// combinator branch carrying anything structural (or an enum outside allOf)
// would need new rules here rather than being dropped silently.
const UNSUPPORTED_IN_BRANCH = new Set([
  'properties',
  'items',
  'additionalProperties',
  'required',
  'default',
  'x-kubernetes-validations',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
])

function main(argv) {
  if (argv.length !== 2) {
    console.error('usage: node frontend/scripts/extract-crd-meta.mjs <crd-dir> <out-file>')
    process.exit(2)
  }
  const [crdDir, outFile] = argv
  const files = readdirSync(crdDir)
    .filter((name) => CRD_FILE.test(name))
    .sort()
  if (files.length === 0) fail(`no ome.io_*.yaml files in ${crdDir}`)

  const kinds = {}
  for (const file of files) {
    const text = readFileSync(path.join(crdDir, file), 'utf8')
    // CORE_SCHEMA keeps scalars JSON-like (no timestamps or binary types).
    for (const doc of yaml.loadAll(text, { schema: yaml.CORE_SCHEMA })) {
      if (!doc || doc.kind !== 'CustomResourceDefinition') continue
      const kind = doc.spec.names.kind
      if (kinds[kind]) fail(`${file}: kind ${kind} is already defined by another file`)
      kinds[kind] = extractKind(doc, file)
    }
  }

  const out = { source: { generator: GENERATOR }, kinds }
  writeFileSync(outFile, JSON.stringify(sortKeysDeep(out), null, 2) + '\n')
  console.log(`wrote ${outFile} (${Object.keys(kinds).length} kinds from ${files.length} files)`)
}

function extractKind(crd, file) {
  const { group, names, scope, versions } = crd.spec
  const stored = (versions ?? []).filter((v) => v.storage === true)
  if (stored.length !== 1) fail(`${file}: expected one storage version, found ${stored.length}`)
  const [version] = stored
  const root = version.schema?.openAPIV3Schema
  if (!root) fail(`${file}: version ${version.name} has no openAPIV3Schema`)

  const meta = { enums: {}, required: {}, defaults: {}, intOrString: [], cel: [] }
  walk(root, '', meta)

  return {
    group,
    version: version.name,
    plural: names.plural,
    singular: names.singular ?? names.kind.toLowerCase(),
    scope,
    shortNames: names.shortNames ?? [],
    listKind: names.listKind ?? `${names.kind}List`,
    subresources: Object.keys(version.subresources ?? {}).sort(),
    printerColumns: (version.additionalPrinterColumns ?? []).map(printerColumn),
    enums: meta.enums,
    required: meta.required,
    defaults: meta.defaults,
    intOrString: meta.intOrString.sort(),
    cel: meta.cel.sort((a, b) => compare(a.path, b.path)),
  }
}

// Record what `schema` says about the value at `at`, then descend.
function walk(schema, at, meta) {
  const values = enumValues(schema)
  if (values) meta.enums[at] = values
  if (schema.required?.length) meta.required[at] = [...schema.required].sort()
  if ('default' in schema) meta.defaults[at] = schema.default
  if (schema['x-kubernetes-int-or-string'] === true) meta.intOrString.push(at)
  for (const v of schema['x-kubernetes-validations'] ?? []) {
    meta.cel.push({ path: at, rule: v.rule, ...pick(v, 'message', 'messageExpression') })
  }
  checkBranches(schema, at)

  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    if (/[.*[\]]/.test(name)) {
      fail(`${at || '<root>'}: property name ${JSON.stringify(name)} would make paths ambiguous`)
    }
    walk(child, at === '' ? name : `${at}.${name}`, meta)
  }
  if (isSchema(schema.items)) walk(schema.items, `${at}[]`, meta)
  if (isSchema(schema.additionalProperties)) {
    walk(schema.additionalProperties, at === '' ? '*' : `${at}.*`, meta)
  }
}

// The allowed values of a schema: its own `enum` intersected with every `enum` that an
// `allOf` branch adds (controller-gen emits one branch per Enum marker). Order follows the
// first list that applies, so values stay in CRD order.
function enumValues(schema) {
  const lists = []
  if (Array.isArray(schema.enum)) lists.push(schema.enum)
  for (const branch of schema.allOf ?? []) {
    if (Array.isArray(branch.enum)) lists.push(branch.enum)
  }
  if (lists.length === 0) return null
  return lists[0].filter((value) => lists.every((list) => list.includes(value)))
}

function checkBranches(schema, at) {
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    for (const branch of schema[key] ?? []) {
      for (const k of Object.keys(branch)) {
        if (UNSUPPORTED_IN_BRANCH.has(k) || (k === 'enum' && key !== 'allOf')) {
          fail(
            `${at || '<root>'}: ${key} branch carries "${k}", which this script does not flatten`
          )
        }
      }
    }
  }
}

function printerColumn(column) {
  return {
    name: column.name,
    jsonPath: column.jsonPath,
    type: column.type,
    priority: column.priority ?? 0,
    ...pick(column, 'description', 'format'),
  }
}

function isSchema(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick(obj, ...keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]))
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (!isSchema(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort(compare)
      .map((k) => [k, sortKeysDeep(value[k])])
  )
}

function fail(message) {
  console.error(`extract-crd-meta: ${message}`)
  process.exit(1)
}

main(process.argv.slice(2))
