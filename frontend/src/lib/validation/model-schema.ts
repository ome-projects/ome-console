import { z } from 'zod'
import {
  DownloadPolicies,
  ModelDistributions,
  type DownloadPolicy,
  type ModelDistribution,
} from '@/lib/types/model'
import { needsNodePath, storageUriIssue, storageUriScheme } from '@/lib/utils/storage-uri'

// The schemas follow the generated BaseModelSpec (lib/types/generated/ome.v1beta1.ts): `storage`
// with a `storageUri` is required, everything else is optional, and API objects are loose so
// that keys the form does not know survive an edit.

/** Form fields submit '' when left blank; the API field is then left out. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)
const optionalString = z.preprocess(emptyToUndefined, z.string().optional())
const optionalEnum = <const T extends readonly string[]>(values: T) =>
  z.preprocess(emptyToUndefined, z.enum(values).optional())

/** A selector left blank by the form ({ name: '' }) is not sent either. */
const unnamedToUndefined = (value: unknown) =>
  value && typeof value === 'object' && !(value as { name?: unknown }).name ? undefined : value

const keyValues = z.record(z.string(), z.string()).optional()

// Model Format schema
export const modelFormatSchema = z.looseObject({
  name: z.string().min(1, 'Model format name is required'),
  version: optionalString,
  operator: optionalString,
  weight: z.number().optional(),
})

// Model Framework schema
export const modelFrameworkSchema = z.looseObject({
  name: z.string().min(1, 'Framework name is required'),
  version: optionalString,
  operator: optionalString,
  weight: z.number().optional(),
})

// Storage schema
export const storageSchema = z.looseObject({
  storageUri: z.string().min(1, 'Storage URI is required'),
  path: optionalString,
  schemaPath: optionalString,
  key: optionalString,
  parameters: keyValues,
  nodeSelector: keyValues,
  nodeAffinity: z.record(z.string(), z.unknown()).optional(),
  downloadPolicy: optionalEnum(DownloadPolicies),
})

// Base Model Spec schema: the API shape. OME fills in modelFormat from the model's files, so it
// is optional here; the create form requires the user's pick (see createSpecSchema).
export const baseModelSpecSchema = z.looseObject({
  modelFormat: modelFormatSchema.optional(),
  modelFramework: z.preprocess(unnamedToUndefined, modelFrameworkSchema.optional()),
  modelType: optionalString,
  modelArchitecture: optionalString,
  modelParameterSize: optionalString,
  storage: storageSchema,
  distribution: optionalEnum(ModelDistributions),
  displayName: optionalString,
  version: optionalString,
  vendor: optionalString,
  disabled: z.boolean().optional(),
})

/**
 * What the create form checks on top of the API shape: a vendor and a format the user picked,
 * and the storage rules OME's webhook applies for the kind (ome/pkg/validation/basemodel.go).
 */
const createSpecSchema = (clusterScoped: boolean) =>
  baseModelSpecSchema
    .extend({
      vendor: z.string().min(1, 'Vendor is required'),
      modelFormat: modelFormatSchema,
    })
    .superRefine((spec, ctx) => {
      const uri = spec.storage.storageUri
      const issue = storageUriIssue(uri, clusterScoped)
      if (issue) {
        ctx.addIssue({ code: 'custom', path: ['storage', 'storageUri'], message: issue })
      }
      if (needsNodePath(uri) && !spec.storage.path) {
        ctx.addIssue({
          code: 'custom',
          path: ['storage', 'path'],
          message: `Path is required for ${storageUriScheme(uri)}:// models`,
        })
      }
      if (spec.distribution === 'Sharded' && storageUriScheme(uri) === 'pvc') {
        ctx.addIssue({
          code: 'custom',
          path: ['distribution'],
          message: "pvc:// models can't use Sharded distribution",
        })
      }
    })

const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Name must be lowercase alphanumeric with dashes')

// ClusterBaseModel schema (cluster-scoped)
export const clusterBaseModelSchema = z.looseObject({
  apiVersion: z.string().default('ome.io/v1beta1'),
  kind: z.string().default('ClusterBaseModel'),
  metadata: z.looseObject({
    name: nameSchema,
    labels: keyValues,
    annotations: keyValues,
  }),
  spec: createSpecSchema(true),
})

// BaseModel schema (namespace-scoped)
export const baseModelSchema = z.looseObject({
  apiVersion: z.string().default('ome.io/v1beta1'),
  kind: z.string().default('BaseModel'),
  metadata: z.looseObject({
    name: nameSchema,
    namespace: z.string().min(1, 'Namespace is required'),
    labels: keyValues,
    annotations: keyValues,
  }),
  spec: createSpecSchema(false),
})

export type BaseModelSpecFormData = z.infer<typeof baseModelSpecSchema>
export type ClusterBaseModelFormData = z.infer<typeof clusterBaseModelSchema>
export type BaseModelFormData = z.infer<typeof baseModelSchema>

/**
 * The values the create form registers. The resolver validates them against the schemas above
 * and hands the parsed object to submit, so blank selects never reach the API.
 */
export interface ModelFormValues {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: {
    vendor: string
    modelParameterSize?: string
    modelFormat: { name: string; version?: string }
    modelFramework?: { name?: string; version?: string }
    storage: { storageUri: string; path?: string; downloadPolicy?: DownloadPolicy }
    distribution?: ModelDistribution
  }
}
