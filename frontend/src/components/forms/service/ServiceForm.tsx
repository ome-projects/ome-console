'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FormProvider, useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clsx } from 'clsx'
import { servicesApi } from '@/lib/api/services'
import { useCreateService, useUpdateService } from '@/lib/hooks/useServices'
import type { InferenceService } from '@/lib/types/service'
import {
  describeIssue,
  inferenceServiceSchema,
  serviceFormSchema,
  type ServiceFormValues,
} from '@/lib/validation/service-schema'
import { Button, ButtonIcons } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Icons } from '@/components/ui/Icons'
import {
  ServiceFormProvider,
  type ServiceFormMode,
  type ServiceFormTab,
} from './ServiceFormContext'
import { buildInferenceService } from './buildInferenceService'
import { defaultServiceFormValues, serviceToFormValues } from './serviceFormValues'
import { parseServiceYaml } from './serviceYaml'
import { YamlTab } from './YamlTab'
import {
  AdvancedSection,
  BasicSection,
  ComponentSection,
  DeploymentSection,
  ModelSection,
  RuntimeSection,
} from './sections'

export interface ServiceFormProps {
  mode: ServiceFormMode
  /** The stored object in edit mode; its metadata.resourceVersion and every unowned spec field are kept. */
  initialData?: InferenceService
  /** Called with the object the API returned once the real create or update succeeded. */
  onSuccess: (service: InferenceService) => void
  backLink?: string
  backLinkText?: string
}

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'submitting' }
  | { kind: 'validated' }
  | { kind: 'invalid'; issues: string[] }
  | { kind: 'api'; phase: 'dryRun' | 'submit'; error: unknown }

/** The form field that owns an object-level validation issue, when the form has one. */
export function formPathForIssue(path: PropertyKey[]): FieldPath<ServiceFormValues> | undefined {
  const key = path.map(String).join('.')
  if (key === 'metadata.name' || key === 'metadata.namespace') return key
  if (key === 'spec.model' || key.startsWith('spec.model.')) return 'model.name'
  if (key === 'spec.runtime' || key.startsWith('spec.runtime.')) return 'runtime.name'
  if (key === 'spec.deploymentMode') return 'deploymentMode'
  if (key === 'spec.ttlSecondsAfterCreation') return 'advanced.ttlSecondsAfterCreation'
  const match = key.match(/^spec\.(engine|decoder|router)\.(.+)$/)
  if (!match) return undefined
  const [, component, field] = match
  if (field === 'minReplicas' || field === 'maxReplicas') {
    return `${component}.${field}` as FieldPath<ServiceFormValues>
  }
  if (field === 'autoscaler.class') {
    return `${component}.autoscaler.class` as FieldPath<ServiceFormValues>
  }
  if (field.startsWith('autoscaler.keda.triggers')) {
    return `${component}.autoscaler.keda.triggersYaml` as FieldPath<ServiceFormValues>
  }
  return undefined
}

function StatusPanel({ status }: { status: SubmitStatus }) {
  switch (status.kind) {
    case 'invalid':
      return (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Fix these before submitting</p>
          <ul className="mt-2 space-y-1">
            {status.issues.map((issue) => (
              <li key={issue} className="font-mono text-xs text-foreground">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'api':
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
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
          className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success"
        >
          The API server accepted the dry run; nothing was changed.
        </div>
      )
    default:
      return null
  }
}

/**
 * Create or edit an InferenceService. The Form tab generates the object; the YAML tab shows it
 * and, once edited, becomes the source of truth. Submitting validates the object against the
 * webhook rules, then asks the API server for a dry run, and only then creates or updates.
 */
export function ServiceForm({
  mode,
  initialData,
  onSuccess,
  backLink = '/services',
  backLinkText = 'Back to Services',
}: ServiceFormProps) {
  const isEditMode = mode === 'edit'
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: initialData ? serviceToFormValues(initialData) : defaultServiceFormValues(),
  })
  const { reset, handleSubmit, getValues, setError } = form

  useEffect(() => {
    if (initialData) reset(serviceToFormValues(initialData))
  }, [initialData, reset])

  const [activeTab, setActiveTab] = useState<ServiceFormTab>('form')
  const [yamlDraft, setYamlDraft] = useState<string | null>(null)
  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' })
  const createService = useCreateService()
  const updateService = useUpdateService()
  const buildOptions = useMemo(() => ({ mode, initialData }), [mode, initialData])
  const busy = status.kind === 'validating' || status.kind === 'submitting'

  const send = (service: InferenceService, dryRun: boolean): Promise<InferenceService> => {
    const { name, namespace } = service.metadata
    if (isEditMode) {
      if (dryRun) return servicesApi.update(name, service, namespace, { dryRun: true })
      return updateService.mutateAsync({ name, namespace, data: service })
    }
    if (dryRun) return servicesApi.create(service, namespace, { dryRun: true })
    return createService.mutateAsync(service)
  }

  const run = async (values: ServiceFormValues, submit: boolean) => {
    let service: InferenceService
    try {
      service =
        yamlDraft !== null
          ? parseServiceYaml(yamlDraft)
          : buildInferenceService(values, buildOptions)
    } catch (error) {
      setStatus({
        kind: 'invalid',
        issues: [error instanceof Error ? error.message : String(error)],
      })
      return
    }

    const check = inferenceServiceSchema.safeParse(service)
    if (!check.success) {
      if (yamlDraft === null) {
        for (const issue of check.error.issues) {
          const path = formPathForIssue(issue.path)
          if (path) setError(path, { type: 'validate', message: issue.message })
        }
      }
      setStatus({ kind: 'invalid', issues: check.error.issues.map(describeIssue) })
      return
    }

    setStatus({ kind: 'validating' })
    try {
      await send(service, true)
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
      const saved = await send(service, false)
      setStatus({ kind: 'idle' })
      onSuccess(saved)
    } catch (error) {
      setStatus({ kind: 'api', phase: 'submit', error })
    }
  }

  const start = (submit: boolean) => {
    setStatus({ kind: 'idle' })
    // An edited YAML is submitted as written; the form's own field validation no longer applies.
    if (yamlDraft !== null) return run(getValues(), submit)
    return handleSubmit((values) => run(values, submit))()
  }

  const tabs: { id: ServiceFormTab; label: string }[] = [
    { id: 'form', label: 'Form' },
    { id: 'yaml', label: 'YAML' },
  ]

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-accent/5">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href={backLink}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icons.arrowLeft size="sm" />
            {backLinkText}
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25">
              <Icons.power className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {isEditMode ? 'Edit Inference Service' : 'Deploy Inference Service'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEditMode ? (
                  <>
                    Update <span className="font-mono">{initialData?.metadata.name}</span>; the API
                    server validates every change before it is saved
                  </>
                ) : (
                  'Create an InferenceService; the API server validates it before it is created'
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <ServiceFormProvider
          value={{
            mode,
            isEditMode,
            initialData,
            activeTab,
            setActiveTab,
            yamlDraft,
            setYamlDraft,
          }}
        >
          <FormProvider {...form}>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void start(true)
              }}
              className="space-y-6"
            >
              <div
                role="tablist"
                className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                      activeTab === tab.id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                    {tab.id === 'yaml' && yamlDraft !== null && (
                      <span className="ml-1 text-warning" aria-label="edited">
                        *
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === 'form' ? (
                <div className="space-y-4">
                  {yamlDraft !== null && (
                    <div
                      role="status"
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
                    >
                      <p className="text-sm text-foreground">
                        The YAML was edited and is what will be submitted; changes made here are
                        ignored until the YAML is regenerated from the form.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('yaml')}
                        >
                          Open YAML
                        </Button>
                        <Button type="button" size="sm" onClick={() => setYamlDraft(null)}>
                          Regenerate from form
                        </Button>
                      </div>
                    </div>
                  )}
                  <BasicSection />
                  <ModelSection />
                  <RuntimeSection />
                  <DeploymentSection />
                  <ComponentSection
                    component="engine"
                    title="Engine"
                    description="The serving engine; every service has one"
                    defaultOpen
                  />
                  <ComponentSection
                    component="decoder"
                    title="Decoder"
                    description="Prefill/decode disaggregation: the decode phase runs apart from the engine"
                    optional
                  />
                  <ComponentSection
                    component="router"
                    title="Router"
                    description="Routes requests to the engine and decoder"
                    optional
                  />
                  <AdvancedSection />
                </div>
              ) : (
                <YamlTab buildOptions={buildOptions} />
              )}

              <StatusPanel status={status} />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void start(false)}
                  disabled={busy}
                  loading={status.kind === 'validating'}
                >
                  Validate (dry run)
                </Button>
                <div className="flex items-center gap-3">
                  <Button href={backLink} variant="ghost">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy}
                    loading={status.kind === 'submitting'}
                    icon={ButtonIcons.check}
                  >
                    {isEditMode ? 'Save Changes' : 'Deploy Service'}
                  </Button>
                </div>
              </div>
            </form>
          </FormProvider>
        </ServiceFormProvider>
      </main>
    </div>
  )
}
