import type { Condition } from '@/lib/types/common'

interface ConditionsTableProps {
  conditions: Condition[] | undefined
  /** Shown when the object reports no conditions; nothing is rendered without one. */
  emptyMessage?: string
}

const statusClass: Record<Condition['status'], string> = {
  True: 'text-success',
  False: 'text-warning',
  Unknown: 'text-muted-foreground',
}

/** An object's `status.conditions` as `kubectl describe` lists them. */
export function ConditionsTable({ conditions, emptyMessage }: ConditionsTableProps) {
  if (!conditions || conditions.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr>
            {['Type', 'Status', 'Reason', 'Message', 'Last transition'].map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {conditions.map((condition) => (
            <tr key={condition.type}>
              <td className="whitespace-nowrap px-4 py-2 font-medium">{condition.type}</td>
              <td
                className={`whitespace-nowrap px-4 py-2 font-medium ${statusClass[condition.status] ?? 'text-muted-foreground'}`}
              >
                {condition.status}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                {condition.reason || '-'}
              </td>
              <td className="px-4 py-2 text-muted-foreground break-words">
                {condition.message || '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                {condition.lastTransitionTime
                  ? new Date(condition.lastTransitionTime).toLocaleString()
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
