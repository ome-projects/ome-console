import type { Container, EnvVar, ResourceRequirements } from '@/lib/types/common'
import type { LeaderSpec, RunnerSpec, ServingRuntimeSpec, WorkerSpec } from '@/lib/types/runtime'

/**
 * The component blocks of a runtime spec as the detail and import pages show them. Engine,
 * decoder and router configs are the InferenceService component types, so the same cards also
 * fit a service's `spec.engine`, `spec.decoder` and `spec.router`.
 */

export type RuntimeComponent = 'router' | 'engine' | 'decoder'

/** The fields the cards read; EngineSpec, DecoderSpec and RouterSpec all satisfy it. */
export interface ComponentConfig {
  runner?: RunnerSpec
  leader?: LeaderSpec
  worker?: WorkerSpec
}

/** The spec fields the cards read; a parsed YAML document fits as well as a typed runtime. */
export type ComponentSpecSource = Pick<
  ServingRuntimeSpec,
  'engineConfig' | 'decoderConfig' | 'routerConfig' | 'containers'
>

const componentTitles: Record<RuntimeComponent, string> = {
  router: '🔀 Router Configuration',
  engine: '⚡ Engine Configuration (Prefill)',
  decoder: '🔄 Decoder Configuration (Decode)',
}

const summaryClass = 'text-xs font-medium text-accent cursor-pointer'
const preClass =
  'mt-1 text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded overflow-x-auto max-h-60 whitespace-pre-wrap break-all leading-relaxed'

function ResourceDisplay({ resources }: { resources?: ResourceRequirements }) {
  if (!resources || (!resources.requests && !resources.limits)) return null

  const section = (label: string, values?: Record<string, string>) =>
    values && (
      <div>
        <span className="font-medium text-gray-600">{label}:</span>
        <div className="ml-3 space-y-0.5">
          {Object.entries(values).map(([key, value]) => (
            <div key={key} className="flex">
              <span className="text-gray-500 w-32">{key}:</span>
              <span className="font-mono text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
    )

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-2">
      <p className="text-xs font-semibold text-gray-700 mb-1.5">Resources</p>
      <div className="space-y-1.5 text-xs">
        {section('Requests', resources.requests)}
        {section('Limits', resources.limits)}
      </div>
    </div>
  )
}

/** `NAME=value`, or `NAME=[from field]` for a value read from a Secret, ConfigMap or field. */
function envText(env: EnvVar): string {
  const value = env.value !== undefined ? env.value : env.valueFrom ? '[from field]' : ''
  return `${env.name}=${value}`
}

function EnvList({
  env,
  summaryClassName = summaryClass,
}: {
  env?: EnvVar[]
  summaryClassName?: string
}) {
  if (!env || env.length === 0) return null
  return (
    <details className="mt-2">
      <summary className={summaryClassName}>🔧 Environment Variables ({env.length})</summary>
      <div className="mt-1 space-y-1 pl-2 max-h-40 overflow-y-auto">
        {env.map((entry, i) => (
          <p key={i} className="text-xs text-gray-600 font-mono break-all">
            {envText(entry)}
          </p>
        ))}
      </div>
    </details>
  )
}

/** Joins the words and starts each `--flag` on its own line, as the runtime pages print them. */
function formatArgs(words: string[]): string {
  return words.join(' ').replace(/--/g, '\n  --').replace(/^\s+/, '')
}

function ArgsBlock({ label, words }: { label: string; words?: string[] }) {
  if (!words || words.length === 0) return null
  return (
    <details className="mt-2">
      <summary className={summaryClass}>{label}</summary>
      <pre className={preClass}>{formatArgs(words)}</pre>
    </details>
  )
}

function RunnerDetails({ runner }: { runner: RunnerSpec }) {
  return (
    <>
      <p className="text-xs font-medium text-gray-700 mb-1">Container: {runner.name || 'N/A'}</p>
      <p className="text-xs text-gray-600 font-mono break-all mb-2">
        Image: {runner.image || 'N/A'}
      </p>
      <ResourceDisplay resources={runner.resources} />
      <EnvList env={runner.env} />
      <ArgsBlock
        label={`💻 Command (${runner.command?.length ?? 0} args)`}
        words={runner.command}
      />
      <ArgsBlock label={`📝 Args (${runner.args?.length ?? 0})`} words={runner.args} />
    </>
  )
}

function NodeSelector({ nodeSelector }: { nodeSelector?: Record<string, string> }) {
  const entries = Object.entries(nodeSelector ?? {})
  if (entries.length === 0) return null
  return (
    <details className="mt-2">
      <summary className={summaryClass}>🎯 Node Selector ({entries.length} rules)</summary>
      <div className="mt-1 space-y-1 pl-2">
        {entries.map(([key, value]) => (
          <p key={key} className="text-xs text-gray-600 font-mono break-all">
            {key}: {String(value)}
          </p>
        ))}
      </div>
    </details>
  )
}

const noRunner = <p className="text-xs text-gray-500 italic">No runner configuration</p>

/**
 * One component's config: the single-node runner, or the leader and worker pods of a
 * multi-node engine or decoder. Renders nothing when the component is not configured.
 */
export function ComponentConfigCard({
  component,
  config,
}: {
  component: RuntimeComponent
  config: ComponentConfig | undefined
}) {
  if (!config) return null
  const { runner, leader, worker } = config
  const workerSize = worker?.size || 1

  return (
    <section
      className="border-l-4 border-accent bg-accent/10 p-4"
      aria-label={componentTitles[component]}
    >
      <h4 className="text-sm font-medium text-accent mb-3">{componentTitles[component]}</h4>
      <div className="space-y-3">
        {runner && !leader && (
          <div className="bg-white rounded-lg p-3 border border-accent/20">
            {component !== 'router' && (
              <p className="text-xs font-bold text-accent/90 mb-2">🖥️ Single Node</p>
            )}
            <RunnerDetails runner={runner} />
          </div>
        )}

        {leader && (
          <div className="bg-white rounded-lg p-3 border border-accent/20">
            <p className="text-xs font-bold text-accent/90 mb-2">👑 Leader Node</p>
            {leader.runner ? <RunnerDetails runner={leader.runner} /> : noRunner}
            <NodeSelector nodeSelector={leader.nodeSelector} />
          </div>
        )}

        {worker && (
          <div className="bg-white rounded-lg p-3 border border-accent/20">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-accent/90">👥 Worker Nodes</p>
              <span className="inline-flex items-center rounded-md bg-accent/20 px-2 py-1 text-xs font-medium text-accent">
                {workerSize} node{workerSize > 1 ? 's' : ''}
              </span>
            </div>
            {worker.runner ? <RunnerDetails runner={worker.runner} /> : noRunner}
          </div>
        )}
      </div>
    </section>
  )
}

/** The plain pod containers of a runtime that declares no engine or decoder config. */
export function RuntimeContainersCard({ containers }: { containers: Container[] | undefined }) {
  if (!containers || containers.length === 0) return null
  return (
    <section className="border-l-4 border-gray-500 bg-gray-50 p-4" aria-label="Containers">
      <h4 className="text-sm font-medium text-gray-900 mb-3">
        📦 Containers ({containers.length})
      </h4>
      <div className="space-y-3">
        {containers.map((container, idx) => (
          <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-medium text-gray-700 mb-1">{container.name}</p>
            <p className="text-xs text-gray-600 font-mono break-all mb-2">{container.image}</p>
            <ResourceDisplay resources={container.resources} />
            <EnvList
              env={container.env}
              summaryClassName="text-xs font-medium text-gray-700 cursor-pointer"
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/** The runtime's shape from its components: PD-disaggregated, engine or decoder only, or plain pods. */
export function RuntimeTypeBadge({ spec }: { spec: ComponentSpecSource | undefined }) {
  const engine = !!spec?.engineConfig
  const decoder = !!spec?.decoderConfig
  if (engine && decoder) {
    return (
      <span className="inline-flex items-center rounded-md bg-purple-100 px-3 py-1.5 text-xs font-bold text-purple-900 ring-1 ring-inset ring-purple-600/20">
        🚀 PREFILL-DECODE DISAGGREGATED (PDD)
      </span>
    )
  }
  if (engine) {
    return (
      <span className="inline-flex items-center rounded-md bg-accent/20 px-3 py-1.5 text-xs font-bold text-blue-900 ring-1 ring-inset ring-blue-600/20">
        ENGINE ONLY
      </span>
    )
  }
  if (decoder) {
    return (
      <span className="inline-flex items-center rounded-md bg-accent/20 px-3 py-1.5 text-xs font-bold text-orange-900 ring-1 ring-inset ring-orange-600/20">
        DECODER ONLY
      </span>
    )
  }
  if (spec?.containers) {
    return (
      <span className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-900 ring-1 ring-inset ring-gray-600/20">
        STANDARD RUNTIME
      </span>
    )
  }
  return null
}

/**
 * Every component card of a runtime spec in display order: router, engine, decoder, and the
 * plain containers when the spec declares neither an engine nor a decoder.
 */
export function RuntimeComponentCards({ spec }: { spec: ComponentSpecSource | undefined }) {
  if (!spec) return null
  const hasComponents = !!spec.engineConfig || !!spec.decoderConfig
  return (
    <>
      <ComponentConfigCard component="router" config={spec.routerConfig} />
      <ComponentConfigCard component="engine" config={spec.engineConfig} />
      <ComponentConfigCard component="decoder" config={spec.decoderConfig} />
      {!hasComponents && <RuntimeContainersCard containers={spec.containers} />}
    </>
  )
}
