'use client'

import { useRuntime, useDeleteRuntime } from '@/lib/hooks/useRuntimes'
import { useRouter } from 'next/navigation'
import { useResourceRef } from '@/lib/hooks/useResourceRef'
import { findCondition, resourceHref, withNamespace } from '@/lib/utils'
import Link from 'next/link'
import { useState } from 'react'
import { ConfirmDeleteModal } from '@/components/ui/Modal'
import { ModelFormatsDisplay } from '@/components/ui/ModelFormatsDisplay'
import { MetadataCollapsible } from '@/components/ui/MetadataCollapsible'
import { ConditionsTable } from '@/components/ui/ConditionsTable'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RuntimeComponentCards, RuntimeTypeBadge } from '@/components/runtimes/ComponentConfigCard'
import {
  INHERIT_FROM_ANNOTATION,
  InheritanceBadge,
  InheritanceChain,
  inheritFrom,
} from '@/components/runtimes/RuntimeInheritance'

export default function RuntimeDetailPage() {
  const { name, namespace } = useResourceRef()
  const router = useRouter()
  const { data: runtime, isLoading, error } = useRuntime(name, namespace)
  const deleteRuntime = useDeleteRuntime()
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleDelete = async () => {
    try {
      await deleteRuntime.mutateAsync({ name, namespace })
      router.push('/runtimes')
    } catch (err) {
      console.error('Failed to delete runtime:', err)
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading runtime details..." />
  }

  if (error || !runtime) {
    return (
      <ErrorState
        error={error || new Error('Runtime not found')}
        backLink={{ href: '/runtimes', label: 'Back to Runtimes' }}
      />
    )
  }

  const parent = inheritFrom(runtime)
  const inheritanceReported = !!findCondition(runtime.status?.conditions, 'InheritanceReady')
  const chain = runtime.status?.inheritanceChain ?? []
  const conditions = runtime.status?.conditions ?? []

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="relative border-b border-border/50 bg-card/50 backdrop-blur-sm animate-in">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/runtimes"
            className="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mb-4"
          >
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Runtimes
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">{runtime.metadata.name}</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">Runtime configuration details</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(withNamespace(`/runtimes/${name}/clone`, namespace))}
                className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                Clone
              </button>
              <button
                onClick={() => router.push(withNamespace(`/runtimes/${name}/edit`, namespace))}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                Edit Runtime
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Runtime Type Badge */}
        <div className="mb-6">
          <RuntimeTypeBadge spec={runtime.spec} />
        </div>

        {/* Runtime Details */}
        <div className="rounded-xl border border-border bg-card shadow-lg animate-in-delay-1">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-base font-medium text-gray-900">Runtime Configuration</h3>
          </div>

          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h4>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{runtime.metadata?.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">Kind</dt>
                  <dd className="mt-1 text-sm text-gray-900">{runtime.kind}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500">API Version</dt>
                  <dd className="mt-1 text-sm text-gray-900">{runtime.apiVersion}</dd>
                </div>
                {runtime.spec?.disabled !== undefined && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Status</dt>
                    <dd className="mt-1">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          runtime.spec.disabled
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {runtime.spec.disabled ? 'Disabled' : 'Active'}
                      </span>
                    </dd>
                  </div>
                )}
                {inheritanceReported && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Inheritance</dt>
                    <dd className="mt-1">
                      <InheritanceBadge runtime={runtime} size="sm" />
                    </dd>
                  </div>
                )}
                {parent && (
                  <div>
                    <dt
                      className="text-xs font-medium text-gray-500"
                      title={INHERIT_FROM_ANNOTATION}
                    >
                      Inherits from
                    </dt>
                    <dd className="mt-1 text-sm">
                      <Link
                        href={resourceHref('/runtimes', {
                          metadata: { name: parent, namespace: runtime.metadata.namespace },
                        })}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        {parent}
                      </Link>
                    </dd>
                  </div>
                )}
                {runtime.metadata?.creationTimestamp && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Created</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {new Date(runtime.metadata.creationTimestamp).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Inheritance chain: status.inheritanceChain, root first */}
            {chain.length > 1 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Inheritance chain</h4>
                <InheritanceChain runtime={runtime} />
              </div>
            )}

            {/* Conditions: InheritanceReady */}
            {conditions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Conditions</h4>
                <ConditionsTable conditions={conditions} />
              </div>
            )}

            {/* Metadata - Labels and Annotations */}
            <MetadataCollapsible
              labels={runtime.metadata?.labels}
              annotations={runtime.metadata?.annotations}
            />

            {/* Supported Model Formats */}
            <ModelFormatsDisplay formats={runtime.spec?.supportedModelFormats || []} />

            {/* Protocol Versions */}
            {runtime.spec?.protocolVersions && runtime.spec.protocolVersions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Protocol Versions</h4>
                <div className="flex flex-wrap gap-2">
                  {runtime.spec.protocolVersions.map((version: string, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-accent ring-1 ring-inset ring-blue-700/10"
                    >
                      {version}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <RuntimeComponentCards spec={runtime.spec} />
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        resourceName={runtime.metadata.name}
        resourceType="runtime"
        isDeleting={deleteRuntime.isPending}
      />
    </div>
  )
}
