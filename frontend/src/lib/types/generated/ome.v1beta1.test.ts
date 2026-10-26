import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  generate,
  loadInputs,
  resolveEnumPath,
  OUTPUT_PATH,
} from '../../../../scripts/gen-ome-types.mjs'
import {
  omeKinds,
  InferenceServiceSpecDeploymentModeValues,
  ComponentAutoscalerClassValues,
  type InferenceService,
  type OMEKind,
} from './ome.v1beta1'

describe('generated OME types', () => {
  it('match api/ome (run `npm run gen:types` after a snapshot bump)', async () => {
    const code = await generate(loadInputs())
    expect(code).toBe(readFileSync(OUTPUT_PATH, 'utf8'))
  })

  it('carry the CRD enums as literal unions', () => {
    expect(InferenceServiceSpecDeploymentModeValues).toEqual(['OMENative', 'RawDeployment'])
    expect(ComponentAutoscalerClassValues).toEqual(['HPA', 'KEDA', 'External', 'None'])
    const service: InferenceService = { spec: { deploymentMode: 'OMENative' } }
    expect(service.spec?.deploymentMode).toBe('OMENative')
  })

  it('carry the CRD metadata for every kind', () => {
    const kinds: OMEKind[] = Object.keys(omeKinds) as OMEKind[]
    expect(kinds).toHaveLength(14)
    expect(omeKinds.InferenceService.plural).toBe('inferenceservices')
    expect(omeKinds.InferenceService.namespaced).toBe(true)
    expect(omeKinds.ClusterBaseModel.namespaced).toBe(false)
    expect(omeKinds.InferenceReplica.subresources).toEqual(['scale', 'status'])
    expect(omeKinds.InferenceService.printerColumns.map((c) => c.name)).toContain('Plan-Drift')
  })

  it('walk enum paths through the swagger', () => {
    const { swagger } = loadInputs()
    const defs = swagger.definitions
    expect(resolveEnumPath(defs, 'v1beta1.InferenceService', 'spec.deploymentMode')).toEqual({
      def: 'v1beta1.InferenceServiceSpec',
      prop: 'deploymentMode',
      items: false,
    })
    expect(
      resolveEnumPath(defs, 'v1beta1.InferenceService', 'status.components.*.autoscaler.class')
    ).toEqual({ def: 'v1beta1.ComponentAutoscalerStatus', prop: 'class', items: false })
    expect(resolveEnumPath(defs, 'v1beta1.InferenceService', 'status.conditions[].status')).toBe(
      'external'
    )
    expect(resolveEnumPath(defs, 'v1beta1.InferenceService', 'spec.nope')).toBeNull()
  })
})
