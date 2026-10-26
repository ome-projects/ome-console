'use client'

import { useAccelerators } from '@/lib/hooks/useAccelerators'
import type { AcceleratorClass } from '@/lib/types/accelerator'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { StatIcons } from '@/components/ui/Icons'
import { PageHeader, StatsGrid, type StatItem } from '@/components/layout'

/** Vendor, family and model as one label, e.g. "nvidia / hopper / H100". */
function hardwareLabel(accelerator: AcceleratorClass): string {
  const parts = [accelerator.spec.vendor, accelerator.spec.family, accelerator.spec.model].filter(
    Boolean
  )
  return parts.length > 0 ? parts.join(' / ') : 'Unknown'
}

export default function AcceleratorsPage() {
  const { data, isLoading, error } = useAccelerators()

  if (isLoading) return <LoadingState message="Loading accelerators..." />
  if (error) return <ErrorState error={error} />

  const items = data?.items ?? []
  const vendors = new Set(items.map((a) => a.spec.vendor).filter(Boolean)).size
  const totalAccelerators = items.reduce((sum, a) => sum + (a.status?.totalAccelerators ?? 0), 0)

  const stats: StatItem[] = [
    {
      label: 'Accelerator Classes',
      value: data?.total || 0,
      icon: StatIcons.total,
      variant: 'primary',
    },
    {
      label: 'Vendors',
      value: vendors,
      icon: StatIcons.runtimes,
      variant: 'accent',
    },
    {
      label: 'Accelerators Discovered',
      value: totalAccelerators,
      icon: StatIcons.ready,
      variant: 'success',
    },
  ]

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Accelerator Classes"
        description="View available accelerator configurations for your cluster"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <StatsGrid stats={stats} columns={3} />

        {/* Accelerators Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((accelerator) => (
            <div
              key={accelerator.metadata.name}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-border/80"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-foreground">
                    {accelerator.metadata.name}
                  </h3>
                  <span className="text-2xl">⚡</span>
                </div>

                <dl className="mt-4 space-y-3">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase">
                      Hardware
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{hardwareLabel(accelerator)}</dd>
                  </div>

                  {accelerator.spec.capabilities?.memoryGB && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">
                        Memory
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {accelerator.spec.capabilities.memoryGB} GB
                      </dd>
                    </div>
                  )}

                  {accelerator.spec.resources && accelerator.spec.resources.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">
                        Resource
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-foreground">
                        {accelerator.spec.resources.map((r) => r.name).join(', ')}
                      </dd>
                    </div>
                  )}

                  {accelerator.status?.totalAccelerators !== undefined && (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground uppercase">
                        Discovered
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {accelerator.status.totalAccelerators} accelerator
                        {accelerator.status.totalAccelerators === 1 ? '' : 's'}
                        {accelerator.status.availableNodes !== undefined &&
                          ` on ${accelerator.status.availableNodes} node${accelerator.status.availableNodes === 1 ? '' : 's'}`}
                      </dd>
                    </div>
                  )}

                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase">Created</dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {accelerator.metadata.creationTimestamp
                        ? new Date(accelerator.metadata.creationTimestamp).toLocaleDateString()
                        : 'Unknown'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">No accelerator classes found in your cluster.</p>
          </div>
        )}
      </main>
    </div>
  )
}
