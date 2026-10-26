'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useServices, useDeleteService } from '@/lib/hooks/useServices'
import { useNamespaces } from '@/lib/hooks/useNamespaces'
import { useBulkSelection } from '@/lib/hooks/useBulkSelection'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button, ButtonIcons } from '@/components/ui/Button'
import { Icons, StatIcons } from '@/components/ui/Icons'
import { BulkActionDropdown } from '@/components/ui/BulkActionDropdown'
import { Checkbox } from '@/components/ui/Checkbox'
import { ConfirmDeleteModal } from '@/components/ui/Modal'
import {
  conditionReason,
  findCondition,
  readyState,
  resourceHref,
  resourceKey,
  type ReadyState,
} from '@/lib/utils'
import {
  ResourcePageHeader,
  StatsGrid,
  ResourceTable,
  EmptyTableState,
  type StatItem,
} from '@/components/layout'
import type { InferenceService } from '@/lib/types/service'

const emptyIcon = <Icons.server size="lg" />

const headerClass =
  'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
const cellClass = 'whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'
const chipClass = 'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium'

/** A service is rolling while any component's canary step machine is away from Stable. */
function isRolling(service: InferenceService): boolean {
  return Object.values(service.status?.components ?? {}).some(
    (component) => component.rolloutPhase && component.rolloutPhase !== 'Stable'
  )
}

/** `kubectl get isvc -o wide` Plan-Source: where the active run's first group was pinned from. */
function planSource(service: InferenceService): string | undefined {
  const group = service.status?.rollout?.activeRun?.plan.groups?.[0]
  if (!group) return undefined
  return group.source === 'Policy' && group.policyRef?.name
    ? `Policy (${group.policyRef.name})`
    : group.source
}

function PlanDriftCell({ service }: { service: InferenceService }) {
  const conditions = service.status?.conditions
  const drift = findCondition(conditions, 'RolloutPlanDrift')
  if (!drift) return <>-</>
  const state =
    drift.status === 'True' ? 'Drifted' : drift.status === 'False' ? 'InSync' : 'Unknown'
  return (
    <StatusBadge state={state} size="sm" title={conditionReason(conditions, 'RolloutPlanDrift')} />
  )
}

export default function ServicesPage() {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [wide, setWide] = useState(false)

  const { data, isLoading, error } = useServices(selectedNamespace || undefined)
  const { data: namespacesData } = useNamespaces()
  const deleteService = useDeleteService()

  const services = useMemo(() => data?.items || [], [data?.items])

  const {
    selectedItems,
    showDeleteModal,
    isDeleting,
    allSelected,
    someSelected,
    handleSelectAll,
    handleSelectItem,
    handleBulkDelete,
    closeDeleteModal,
    bulkActions,
    deleteModalResourceName,
  } = useBulkSelection({
    items: services,
    resourceType: 'service',
    basePath: '/services',
    deleteMutation: deleteService,
  })

  if (isLoading) return <LoadingState message="Loading services..." />
  if (error) return <ErrorState error={error || new Error('Failed to load services')} />

  const countState = (state: ReadyState) =>
    services.filter((s) => readyState(s.status?.conditions) === state).length

  const stats: StatItem[] = [
    {
      label: 'Total Services',
      value: data?.total || 0,
      icon: StatIcons.services,
      variant: 'primary',
    },
    { label: 'Ready', value: countState('Ready'), icon: StatIcons.ready, variant: 'success' },
    {
      label: 'Not ready',
      value: countState('NotReady'),
      icon: StatIcons.failed,
      variant: 'warning',
    },
    {
      label: 'Rolling',
      value: services.filter(isRolling).length,
      icon: StatIcons.autoSelect,
      variant: 'accent',
    },
  ]

  const columnCount = 9 + (wide ? 3 : 0)

  return (
    <div className="min-h-screen pb-12">
      <ResourcePageHeader
        title="Inference Services"
        description="Manage your InferenceService deployments"
        actions={
          <Button href="/services/deploy" icon={ButtonIcons.plus}>
            Deploy Service
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StatsGrid stats={stats} />

        <ResourceTable
          title="All Services"
          headerActions={
            <>
              <BulkActionDropdown actions={bulkActions} selectedCount={selectedItems.size} />
              <Button
                variant={wide ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setWide(!wide)}
                aria-pressed={wide}
                title="Also show placement, plan source and plan drift"
              >
                Wide
              </Button>
            </>
          }
          filterProps={{
            namespaces: namespacesData?.items,
            selectedNamespace,
            onNamespaceChange: setSelectedNamespace,
            scopeLabel: 'Namespace:',
            defaultOptionText: 'All namespaces',
            namespaceFormat: (ns) => ns,
          }}
        >
          <thead className="bg-muted/50">
            <tr>
              <th className="w-12 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                  aria-label="Select all services"
                />
              </th>
              <th className={headerClass}>Name</th>
              <th className={headerClass}>Namespace</th>
              <th className={headerClass}>URL</th>
              <th className={headerClass}>Ready</th>
              <th className={headerClass}>BaseModel</th>
              <th className={headerClass}>Runtime</th>
              <th className={headerClass}>Mode</th>
              {wide && (
                <>
                  <th className={headerClass}>Placement</th>
                  <th className={headerClass}>Plan source</th>
                  <th className={headerClass}>Plan drift</th>
                </>
              )}
              <th className={headerClass}>Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {services.length === 0 ? (
              <EmptyTableState
                colSpan={columnCount}
                icon={emptyIcon}
                message="No inference services found"
                action={
                  <Button
                    href="/services/deploy"
                    variant="outline"
                    size="sm"
                    icon={ButtonIcons.plus}
                  >
                    Deploy your first service
                  </Button>
                }
              />
            ) : (
              services.map((service: InferenceService) => {
                const conditions = service.status?.conditions
                const model = service.spec.model
                const runtime = service.spec.runtime
                const url = service.status?.url
                return (
                  <tr
                    key={resourceKey(service)}
                    className={`transition-colors hover:bg-muted/30 ${
                      selectedItems.has(resourceKey(service)) ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="w-12 px-4 py-4">
                      <Checkbox
                        checked={selectedItems.has(resourceKey(service))}
                        onChange={(checked) => handleSelectItem(resourceKey(service), checked)}
                        aria-label={`Select ${service.metadata.name}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                      <Link
                        href={resourceHref('/services', service)}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        {service.metadata.name}
                      </Link>
                    </td>
                    <td className={cellClass}>
                      <span className={chipClass}>{service.metadata.namespace || 'default'}</span>
                    </td>
                    <td className={cellClass}>
                      {url ? (
                        <span
                          className="inline-block max-w-[16rem] truncate align-bottom font-mono text-xs"
                          title={url}
                        >
                          {url}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge
                        state={readyState(conditions)}
                        size="sm"
                        title={conditionReason(conditions, 'Ready')}
                      />
                    </td>
                    <td className={cellClass}>
                      {model?.name ? (
                        <span className="inline-flex items-center gap-1.5">
                          {model.name}
                          {model.kind === 'BaseModel' && (
                            <span className={chipClass} title="Namespaced BaseModel">
                              BaseModel
                            </span>
                          )}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className={cellClass}>
                      {runtime?.name ? (
                        <span className="inline-flex items-center gap-1.5">
                          {runtime.name}
                          {runtime.kind === 'ServingRuntime' && (
                            <span className={chipClass} title="Namespaced ServingRuntime">
                              ServingRuntime
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="italic" title="OME selects the runtime from the model">
                          auto
                        </span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <span className={chipClass}>
                        {service.spec.deploymentMode || 'RawDeployment'}
                      </span>
                    </td>
                    {wide && (
                      <>
                        <td className="whitespace-nowrap px-6 py-4">
                          {service.status?.placement?.phase ? (
                            <StatusBadge state={service.status.placement.phase} size="sm" />
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className={cellClass}>{planSource(service) || '-'}</td>
                        <td className={cellClass}>
                          <PlanDriftCell service={service} />
                        </td>
                      </>
                    )}
                    <td className={cellClass}>
                      {service.metadata.creationTimestamp
                        ? new Date(service.metadata.creationTimestamp).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </ResourceTable>
      </main>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        onConfirm={handleBulkDelete}
        resourceName={deleteModalResourceName}
        resourceType="service"
        isDeleting={isDeleting}
      />
    </div>
  )
}
