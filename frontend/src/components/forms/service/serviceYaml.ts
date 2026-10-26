import yaml from 'js-yaml'
import type { InferenceService } from '@/lib/types/service'
import { isPlainObject } from '@/lib/utils/object'

/** The object as the YAML tab shows it: every key, in the builder's order, nothing pruned. */
export function serviceToYaml(service: InferenceService): string {
  return yaml.dump(service, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    skipInvalid: true,
  })
}

/** The YAML tab's text as the object to submit. Throws with a one-line reason when it is not one object. */
export function parseServiceYaml(text: string): InferenceService {
  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    throw new Error(`YAML is not valid: ${reason}`)
  }
  if (!isPlainObject(parsed)) {
    throw new Error('YAML must describe one InferenceService object')
  }
  return parsed as InferenceService
}

/**
 * A commented `spec.rollout` example. The builder writes `spec` last, so lines appended to the
 * document and indented by two spaces belong to it: removing the leading `# ` enables them.
 */
export const ROLLOUT_SKELETON = [
  '',
  '# Rollout groups (needs deploymentMode: OMENative). Remove the leading "# " to enable.',
  '#   rollout:',
  '#     groupOrdering: Sequential',
  '#     groups:',
  '#       - components: [engine]',
  '#         canary:',
  '#           steps:',
  '#             - capacity: "25%"',
  '#               traffic: 10',
  '#               pause: {}          # manual gate: promote with ome.io/rollout-promote',
  '#             - capacity: "100%"',
  '#               traffic: 100',
  '#         # policyRef: { name: my-rollout-policy, progression: canary }',
  '#       - components: [router]',
  '#         blueGreen: {}',
  '',
].join('\n')

/** Appends the rollout skeleton once. */
export function withRolloutSkeleton(text: string): string {
  if (text.includes('#   rollout:')) return text
  return text.replace(/\s*$/, '\n') + ROLLOUT_SKELETON
}
