import type { MigrationStatus } from '@/lib/types/replica'
import { componentLabel, formatTimestamp } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface MigrationsListProps {
  component: string
  /** `replica.status.migrations`: one record per migration request, newest last. */
  migrations?: MigrationStatus[]
}

const headerClass =
  'px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
const cellClass = 'px-4 py-2 text-sm align-top'

/** The instance migrations of a component: in-flight ones first, then the recent history. */
export function MigrationsList({ component, migrations }: MigrationsListProps) {
  if (!migrations || migrations.length === 0) return null
  const rows = [...migrations].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  )

  return (
    <section
      aria-label={`${componentLabel(component)} migrations`}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-muted/30 px-6 py-3">
        <h3 className="text-sm font-semibold">
          {componentLabel(component)} migrations ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className={headerClass}>Phase</th>
              <th className={headerClass}>Instance</th>
              <th className={headerClass}>Trigger</th>
              <th className={headerClass}>From node</th>
              <th className={headerClass}>Target nodes</th>
              <th className={headerClass}>Started</th>
              <th className={headerClass}>Completed</th>
              <th className={headerClass}>Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((migration) => (
              <tr key={migration.requestUUID} title={`request ${migration.requestUUID}`}>
                <td className={cellClass}>
                  <StatusBadge state={migration.phase} size="sm" />
                  {migration.succeeded !== undefined && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {migration.succeeded ? 'succeeded' : 'not yet ready'}
                    </span>
                  )}
                </td>
                <td className={`${cellClass} whitespace-nowrap`}>
                  {component} #{migration.sourceInstance}
                  {migration.surgeInstance !== undefined && (
                    <span className="text-muted-foreground"> → #{migration.surgeInstance}</span>
                  )}
                </td>
                <td className={cellClass}>
                  {migration.trigger}
                  {migration.attempt !== undefined && (
                    <span className="text-muted-foreground"> (attempt {migration.attempt})</span>
                  )}
                </td>
                <td className={`${cellClass} font-mono text-xs`}>{migration.fromNode || '-'}</td>
                <td className={`${cellClass} font-mono text-xs`}>
                  {migration.hintTargetNodes?.length ? migration.hintTargetNodes.join(', ') : '-'}
                </td>
                <td className={`${cellClass} whitespace-nowrap text-muted-foreground`}>
                  {formatTimestamp(migration.startedAt)}
                  {migration.allocatedAt && (
                    <div className="text-xs">
                      allocated {formatTimestamp(migration.allocatedAt)}
                    </div>
                  )}
                </td>
                <td className={`${cellClass} whitespace-nowrap text-muted-foreground`}>
                  {migration.completedAt ? (
                    formatTimestamp(migration.completedAt)
                  ) : (
                    <span className="text-xs">deadline {formatTimestamp(migration.deadline)}</span>
                  )}
                </td>
                <td className={`${cellClass} max-w-md break-words text-muted-foreground`}>
                  {migration.reason || '-'}
                  {migration.message && <div className="text-xs">{migration.message}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
