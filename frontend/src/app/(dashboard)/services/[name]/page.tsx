'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useService, useDeleteService } from '@/lib/hooks/useServices'
import { useServiceInstances } from '@/lib/hooks/useServiceInstances'
import { useCapability } from '@/lib/hooks/useCapabilities'
import { useResourceRef } from '@/lib/hooks/useResourceRef'
import type { DecodedServiceReplica } from '@/lib/api/serviceReplicas'
import {
  conditionReason,
  isOMENativeService,
  readyState,
  resourceEditHref,
  sortComponents,
} from '@/lib/utils'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Chip } from '@/components/ui/Chip'
import { Button, ButtonIcons } from '@/components/ui/Button'
import { ConfirmDeleteModal } from '@/components/ui/Modal'
import { CapabilityGate } from '@/components/ui/CapabilityGate'
import { Panel } from '@/components/ui/Panel'
import { ServiceOverview } from '@/components/services/ServiceOverview'
import { ComponentCard } from '@/components/services/ComponentCard'
import { RolloutPanel } from '@/components/services/RolloutPanel'
import { TrafficPanel } from '@/components/services/TrafficPanel'
import { ModelStatusPanel } from '@/components/services/ModelStatusPanel'
import { InstancesGrid } from '@/components/services/InstancesGrid'
import { RetryBlocksBanner } from '@/components/services/RetryBlocksBanner'
import { MigrationsList } from '@/components/services/MigrationsList'
import { EventsPanel } from '@/components/services/EventsPanel'
import { LogViewer, type LogRequest } from '@/components/services/LogViewer'
import { YamlPanel } from '@/components/services/YamlPanel'

/** Decoded replicas in component order. */
function sortReplicas(items: DecodedServiceReplica[]): DecodedServiceReplica[] {
  const order = sortComponents(items.map((item) => item.replica.spec.component))
  return [...items].sort(
    (a, b) => order.indexOf(a.replica.spec.component) - order.indexOf(b.replica.spec.component)
  )
}

export default function ServiceDetailPage() {
  const { name, namespace } = useResourceRef()
  const router = useRouter()
  const { data: service, isLoading, error } = useService(name, namespace)
  const deleteService = useDeleteService()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [logRequest, setLogRequest] = useState<LogRequest | null>(null)
  const logViewerRef = useRef<HTMLElement>(null)

  const omenative = !!service && isOMENativeService(service)
  const capability = useCapability({ feature: 'omenative' })
  const instancesQuery = useServiceInstances(service?.metadata.namespace ?? namespace, name, {
    enabled: omenative && !capability.isLoading && capability.available,
  })
  const replicas = useMemo(
    () => sortReplicas(instancesQuery.data?.items ?? []),
    [instancesQuery.data?.items]
  )
  const instancesByComponent = useMemo(() => {
    const result: Record<string, number[]> = {}
    for (const item of replicas) {
      result[item.replica.spec.component] = item.instances
        .map((instance) => instance.index)
        .sort((a, b) => a - b)
    }
    return result
  }, [replicas])

  const openLogs = useCallback((component: string, instance: number) => {
    setLogRequest((previous) => ({ component, instance, nonce: (previous?.nonce ?? 0) + 1 }))
    const viewer = logViewerRef.current
    if (viewer && typeof viewer.scrollIntoView === 'function') {
      viewer.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleDelete = async () => {
    try {
      await deleteService.mutateAsync({ name, namespace: service?.metadata.namespace ?? namespace })
      router.push('/services')
    } catch (err) {
      console.error('Failed to delete service:', err)
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading service details..." />
  }

  if (error || !service) {
    return (
      <ErrorState
        error={error || new Error('Service not found')}
        backLink={{ href: '/services', label: 'Back to Services' }}
      />
    )
  }

  const serviceNamespace = service.metadata.namespace ?? namespace ?? ''
  const conditions = service.status?.conditions
  const components = service.status?.components ?? {}
  const componentNames = sortComponents(Object.keys(components))

  return (
    <div className="min-h-screen pb-12">
      <header className="relative border-b border-border/50 bg-card/50 backdrop-blur-sm animate-in">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/services"
            className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            Back to Services
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight">{service.metadata.name}</h1>
                <StatusBadge
                  state={readyState(conditions)}
                  title={conditionReason(conditions, 'Ready')}
                />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                InferenceService in
                <Chip>{serviceNamespace || 'default'}</Chip>
                <Chip>{service.spec.deploymentMode || 'RawDeployment'}</Chip>
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                href={resourceEditHref('/services', service)}
                icon={ButtonIcons.edit}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteModal(true)}
                icon={ButtonIcons.trash}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <ServiceOverview service={service} />

        <section aria-label="Components" className="space-y-4">
          <h2 className="text-lg font-semibold">Components</h2>
          {componentNames.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              The controller has not reported any component yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {componentNames.map((componentName) => (
                <ComponentCard
                  key={componentName}
                  name={componentName}
                  status={components[componentName]}
                />
              ))}
            </div>
          )}
        </section>

        <RolloutPanel status={service.status} rolloutSpec={service.spec.rollout} />
        <TrafficPanel traffic={service.status?.traffic} />
        <ModelStatusPanel
          modelStatus={service.status?.modelStatus}
          mountedOverlays={service.status?.mountedOverlays}
        />

        {omenative && (
          <section aria-label="Instances" className="space-y-4">
            <h2 className="text-lg font-semibold">Instances</h2>
            <CapabilityGate feature="omenative" label="OMENative instances">
              {instancesQuery.error ? (
                <ErrorState error={instancesQuery.error} compact />
              ) : instancesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading instances...</p>
              ) : replicas.length === 0 ? (
                <Panel title="No instances yet">
                  <p className="text-sm text-muted-foreground">
                    No InferenceReplica of this service has reported instances yet.
                  </p>
                </Panel>
              ) : (
                replicas.map((item) => {
                  const component = item.replica.spec.component
                  return (
                    <div key={item.replica.metadata.name} className="space-y-4">
                      <RetryBlocksBanner
                        component={component}
                        retryBlocks={item.replica.status?.retryBlocks}
                      />
                      <InstancesGrid
                        component={component}
                        replica={item.replica}
                        encoding={item.encoding}
                        instances={item.instances}
                        decodeError={item.decodeError}
                        onOpenLogs={(instance) => openLogs(component, instance)}
                      />
                      <MigrationsList
                        component={component}
                        migrations={item.replica.status?.migrations}
                      />
                    </div>
                  )
                })
              )}
            </CapabilityGate>
          </section>
        )}

        <LogViewer
          ref={logViewerRef}
          namespace={serviceNamespace}
          name={service.metadata.name}
          components={componentNames}
          instancesByComponent={instancesByComponent}
          request={logRequest}
        />

        <EventsPanel namespace={serviceNamespace} name={service.metadata.name} />

        <YamlPanel object={service} />
      </main>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        resourceName={service.metadata.name}
        resourceType="service"
        isDeleting={deleteService.isPending}
      />
    </div>
  )
}
