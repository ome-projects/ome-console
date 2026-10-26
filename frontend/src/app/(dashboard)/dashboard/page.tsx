'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useModels } from '@/lib/hooks/useModels'
import { useNamespaces } from '@/lib/hooks/useNamespaces'
import { useRuntimes } from '@/lib/hooks/useRuntimes'
import { useServices } from '@/lib/hooks/useServices'
import { LoadingState } from '@/components/ui/LoadingState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, TableLink, TableText } from '@/components/ui/DataTable'
import { Button, ButtonIcons } from '@/components/ui/Button'
import { StatIcons } from '@/components/ui/Icons'
import { readyState, resourceHref, resourceKey } from '@/lib/utils'
import { ResourceFilters, ResourcePageHeader, StatsGrid, type StatItem } from '@/components/layout'
import type { ClusterBaseModel } from '@/lib/types/model'

export default function DashboardPage() {
  // The backend lists BaseModels per namespace only, so the dashboard counts every
  // ClusterBaseModel plus the BaseModels of one namespace chosen here.
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')

  const { data: clusterModels, isLoading: modelsLoading } = useModels()
  const { data: namespaceModels, isLoading: namespaceModelsLoading } = useModels(
    selectedNamespace || undefined
  )
  const { data: namespacesData } = useNamespaces()
  const { data: runtimesData, isLoading: runtimesLoading } = useRuntimes()
  const { data: servicesData, isLoading: servicesLoading } = useServices()

  if (modelsLoading || runtimesLoading || servicesLoading) {
    return <LoadingState message="Loading dashboard..." />
  }

  const models: ClusterBaseModel[] = [
    ...(clusterModels?.items ?? []),
    ...(selectedNamespace && !namespaceModelsLoading ? (namespaceModels?.items ?? []) : []),
  ]
  const services = servicesData?.items ?? []
  const readyServices = services.filter((s) => readyState(s.status?.conditions) === 'Ready')

  const recentModels = [...models]
    .sort((a, b) =>
      (b.metadata.creationTimestamp ?? '').localeCompare(a.metadata.creationTimestamp ?? '')
    )
    .slice(0, 5)

  const columns = [
    {
      key: 'name',
      header: 'Name',
      cell: (model: ClusterBaseModel) => (
        <TableLink href={resourceHref('/models', model)}>{model.metadata.name}</TableLink>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      cell: (model: ClusterBaseModel) => (
        <TableText muted>{model.metadata.namespace || 'Cluster'}</TableText>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      cell: (model: ClusterBaseModel) => <TableText muted>{model.spec.vendor || '-'}</TableText>,
    },
    {
      key: 'framework',
      header: 'Framework',
      cell: (model: ClusterBaseModel) => (
        <TableText muted>{model.spec.modelFramework?.name || '-'}</TableText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (model: ClusterBaseModel) => <StatusBadge state={model.status?.state} size="sm" />,
    },
  ]

  const stats: StatItem[] = [
    {
      label: 'Total Models',
      value: models.length,
      icon: StatIcons.models,
      href: '/models',
      variant: 'primary',
    },
    {
      label: 'Ready Models',
      value: models.filter((m) => m.status?.state === 'Ready').length,
      icon: StatIcons.ready,
      href: '/models',
      variant: 'success',
    },
    {
      label: 'Runtimes',
      value: runtimesData?.total || 0,
      icon: StatIcons.runtimes,
      href: '/runtimes',
      variant: 'accent',
    },
    {
      label: 'Total Services',
      value: servicesData?.total || 0,
      icon: StatIcons.services,
      href: '/services',
      variant: 'warning',
    },
    {
      label: 'Ready Services',
      value: readyServices.length,
      icon: StatIcons.ready,
      href: '/services',
      variant: 'success',
    },
    {
      label: 'Not Ready Services',
      value: services.length - readyServices.length,
      icon: StatIcons.failed,
      href: '/services',
      variant: 'muted',
    },
  ]

  return (
    <div className="min-h-screen">
      <ResourcePageHeader
        title="Dashboard"
        description="Overview of your OME resources"
        actions={
          <>
            <ResourceFilters
              namespaces={namespacesData?.items}
              selectedNamespace={selectedNamespace}
              onNamespaceChange={setSelectedNamespace}
              scopeLabel="Models:"
              defaultOptionText="Cluster-scoped only"
              namespaceFormat={(ns) => `Cluster + ${ns}`}
            />
            <Button href="/models/import" icon={ButtonIcons.import}>
              Quick Import
            </Button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StatsGrid stats={stats} columns={3} />

        <DataTable
          title="Recent Models"
          columns={columns}
          data={recentModels}
          keyExtractor={resourceKey}
          headerActions={
            <Link
              href="/models"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
            >
              View all
              <svg
                className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          }
          emptyState={
            <div className="flex flex-col items-center gap-3 py-4">
              <svg
                className="h-12 w-12 text-muted-foreground/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                />
              </svg>
              <p className="text-sm text-muted-foreground">No models yet</p>
              <Button href="/models/import" variant="outline" size="sm" icon={ButtonIcons.import}>
                Import your first model
              </Button>
            </div>
          }
        />
      </main>
    </div>
  )
}
