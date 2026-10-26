'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { runtimesApi } from '@/lib/api/runtimes'
import { useCreateRuntime, useUpdateRuntime } from '@/lib/hooks/useRuntimes'
import type { Runtime } from '@/lib/types/runtime'
import { runtimeFormSchema, type RuntimeFormValues } from '@/lib/validation/runtime-schema'
import { exportAsYaml } from '@/lib/utils'
import { ErrorState } from '@/components/ui/ErrorState'
import { Icons } from '@/components/ui/Icons'
import { Spinner } from '@/components/ui/Spinner'
import { RuntimeFormProvider } from './RuntimeFormContext'
import { buildRuntime, defaultRuntimeFormValues, runtimeToFormValues } from './runtimeFormValues'
import {
  BasicInfoSection,
  ModelFormatsSection,
  EngineConfigSection,
  DecoderConfigSection,
  RouterConfigSection,
  ScalingPolicySection,
} from './sections'

export interface RuntimeFormProps {
  mode: 'create' | 'edit'
  /**
   * The stored object in edit mode, whose resourceVersion and every field the form does not
   * own are kept, or the source of a clone.
   */
  initialData?: Runtime
  /** Called with the object the API returned once the real create or update succeeded. */
  onSuccess: (runtime: Runtime) => void
  isLoading?: boolean
  backLink: string
  backLinkText: string
  /** When set, indicates this is a clone operation from the specified runtime */
  cloneFrom?: string
}

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'submitting' }
  | { kind: 'validated' }
  | { kind: 'invalid'; issues: string[] }
  | { kind: 'api'; phase: 'dryRun' | 'submit'; error: unknown }

/**
 * `spec.engineConfig.minReplicas: message` for every field error, so an error inside a
 * collapsed section is still visible next to the buttons.
 */
export function listFieldErrors(errors: FieldErrors, path: string[] = []): string[] {
  const issues: string[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== 'object' || key === 'ref') continue
    if (typeof Element !== 'undefined' && value instanceof Element) continue
    const next = [...path, key]
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      issues.push(`${next.join('.')}: ${message}`)
    } else {
      issues.push(...listFieldErrors(value as FieldErrors, next))
    }
  }
  return issues
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function StatusPanel({ status }: { status: SubmitStatus }) {
  switch (status.kind) {
    case 'invalid':
      return (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Fix these before submitting</p>
          <ul className="mt-2 space-y-1">
            {status.issues.map((issue) => (
              <li key={issue} className="font-mono text-xs text-slate-800">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'api':
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            {status.phase === 'dryRun'
              ? 'The API server rejected the dry run; nothing was changed'
              : 'The request failed after a successful dry run'}
          </p>
          <ErrorState error={status.error} compact className="!py-3" />
        </div>
      )
    case 'validated':
      return (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          The API server accepted the dry run; nothing was changed.
        </div>
      )
    default:
      return null
  }
}

const secondaryButtonClassName =
  'rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2'

/**
 * RuntimeForm - Main orchestrator component for creating/editing ServingRuntime and
 * ClusterServingRuntime resources.
 *
 * The form holds the whole object (minus status) so an edit writes back every field it has no
 * inputs for. Submitting validates the form, asks the API server for a dry run, and only then
 * creates or updates; the scope (kind and namespace) picks the endpoint.
 */
export function RuntimeForm({
  mode,
  initialData,
  onSuccess,
  isLoading = false,
  backLink,
  backLinkText,
  cloneFrom,
}: RuntimeFormProps) {
  const isEditMode = mode === 'edit'
  const isCloneMode = mode === 'create' && !!cloneFrom

  const form = useForm<RuntimeFormValues>({
    resolver: zodResolver(runtimeFormSchema),
    defaultValues: initialData ? runtimeToFormValues(initialData) : defaultRuntimeFormValues(),
  })
  const { handleSubmit, reset, getValues } = form

  // Pre-populate form when initial data is provided (edit/clone mode)
  useEffect(() => {
    if (initialData) reset(runtimeToFormValues(initialData))
  }, [initialData, reset])

  // Compute initial multi-node states from initialData immediately (not in useEffect)
  // This ensures the provider receives the correct initial values on first render
  const initialEngineMultiNode = useMemo(() => {
    return !!(initialData?.spec?.engineConfig?.leader || initialData?.spec?.engineConfig?.worker)
  }, [initialData])

  const initialDecoderMultiNode = useMemo(() => {
    return !!(initialData?.spec?.decoderConfig?.leader || initialData?.spec?.decoderConfig?.worker)
  }, [initialData])

  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' })
  const createRuntime = useCreateRuntime()
  const updateRuntime = useUpdateRuntime()
  const buildOptions = useMemo(() => ({ mode, initialData }), [mode, initialData])
  const busy = status.kind === 'validating' || status.kind === 'submitting'

  const send = (runtime: Runtime, dryRun: boolean): Promise<Runtime> => {
    const { name, namespace } = runtime.metadata
    if (isEditMode) {
      if (dryRun) return runtimesApi.update(name, runtime, namespace, { dryRun: true })
      return updateRuntime.mutateAsync({ name, namespace, runtime })
    }
    if (dryRun) return runtimesApi.create(runtime, undefined, { dryRun: true })
    return createRuntime.mutateAsync(runtime)
  }

  const run = async (values: RuntimeFormValues, submit: boolean) => {
    let runtime: Runtime
    try {
      runtime = buildRuntime(values, buildOptions)
    } catch (error) {
      setStatus({ kind: 'invalid', issues: [describeError(error)] })
      return
    }

    setStatus({ kind: 'validating' })
    try {
      await send(runtime, true)
    } catch (error) {
      setStatus({ kind: 'api', phase: 'dryRun', error })
      return
    }
    if (!submit) {
      setStatus({ kind: 'validated' })
      return
    }

    setStatus({ kind: 'submitting' })
    try {
      const saved = await send(runtime, false)
      setStatus({ kind: 'idle' })
      onSuccess(saved)
    } catch (error) {
      setStatus({ kind: 'api', phase: 'submit', error })
    }
  }

  const start = (submit: boolean) => {
    setStatus({ kind: 'idle' })
    return handleSubmit(
      (values) => run(values, submit),
      (errors) => setStatus({ kind: 'invalid', issues: listFieldErrors(errors) })
    )()
  }

  const handleExportYaml = () => {
    try {
      const runtime = buildRuntime(getValues(), buildOptions)
      exportAsYaml(runtime, `${runtime.metadata.name || 'runtime'}.yaml`)
    } catch (error) {
      setStatus({ kind: 'invalid', issues: [describeError(error)] })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-purple-600" />
          <p className="text-sm font-medium text-slate-600">Loading runtime configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Link
            href={backLink}
            className="group inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-purple-600 transition-colors mb-3"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            <span>{backLinkText}</span>
          </Link>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            {isEditMode ? 'Edit Runtime' : isCloneMode ? 'Clone Runtime' : 'Create New Runtime'}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600 font-medium">
            <span>
              {isEditMode ? (
                <>
                  Configure{' '}
                  <span className="font-mono text-purple-600">{initialData?.metadata?.name}</span>{' '}
                  runtime settings; the API server validates every change before it is saved
                </>
              ) : isCloneMode ? (
                <>
                  Create a new runtime based on{' '}
                  <span className="font-mono text-purple-600">{cloneFrom}</span>
                </>
              ) : (
                <>
                  Define a new{' '}
                  <span className="font-mono text-purple-600">ClusterServingRuntime</span> or{' '}
                  <span className="font-mono text-purple-600">ServingRuntime</span> resource
                </>
              )}
            </span>
            {(isEditMode || isCloneMode) && initialData && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {initialData.metadata?.namespace
                  ? `Namespace: ${initialData.metadata.namespace}`
                  : 'Cluster-scoped'}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <RuntimeFormProvider
          form={form}
          isEditMode={isEditMode}
          initialEngineMultiNode={initialEngineMultiNode}
          initialDecoderMultiNode={initialDecoderMultiNode}
        >
          <FormProvider {...form}>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void start(true)
              }}
              className="space-y-4"
            >
              <BasicInfoSection />
              <ModelFormatsSection />
              <EngineConfigSection />
              <DecoderConfigSection />
              <RouterConfigSection />
              <ScalingPolicySection />

              <StatusPanel status={status} />

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
                {/* Export and dry run - Left side */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportYaml}
                    className={secondaryButtonClassName}
                  >
                    <Icons.downloadFile size="sm" />
                    Export YAML
                  </button>
                  <button
                    type="button"
                    onClick={() => void start(false)}
                    disabled={busy}
                    className={secondaryButtonClassName}
                  >
                    {status.kind === 'validating' ? (
                      <>
                        <Spinner size="sm" />
                        Validating...
                      </>
                    ) : (
                      'Validate (dry run)'
                    )}
                  </button>
                </div>

                {/* Cancel and Submit - Right side */}
                <div className="flex items-center gap-4">
                  <Link
                    href={backLink}
                    className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
                  >
                    {status.kind === 'submitting' ? (
                      <>
                        <Spinner size="sm" />
                        {isEditMode ? 'Saving...' : 'Creating...'}
                      </>
                    ) : isEditMode ? (
                      'Save Changes'
                    ) : (
                      'Create Runtime'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </FormProvider>
        </RuntimeFormProvider>
      </main>
    </div>
  )
}
