import type { RetryBlock } from '@/lib/types/replica'
import { componentLabel, formatTimestamp } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Revision } from './Revision'

interface RetryBlocksBannerProps {
  component: string
  /** `replica.status.retryBlocks`: one block per target revision whose update attempts failed. */
  retryBlocks?: RetryBlock[]
}

/** Why instances of a component are not retrying a revision: the replica's retry blocks. */
export function RetryBlocksBanner({ component, retryBlocks }: RetryBlocksBannerProps) {
  if (!retryBlocks || retryBlocks.length === 0) return null

  return (
    <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4">
      <h3 className="text-sm font-medium text-warning">
        {componentLabel(component)}: {retryBlocks.length === 1 ? 'retry block' : 'retry blocks'} on{' '}
        {retryBlocks.length} target {retryBlocks.length === 1 ? 'revision' : 'revisions'}
      </h3>
      <ul className="mt-3 space-y-2">
        {retryBlocks.map((block) => (
          <li
            key={block.targetRevision}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          >
            <StatusBadge state={block.state} size="sm" />
            <span>
              target <Revision name={block.targetRevision} />
            </span>
            <span className="text-muted-foreground">
              {block.attemptsStarted} {block.attemptsStarted === 1 ? 'attempt' : 'attempts'}
            </span>
            {block.nextRetryAt && (
              <span className="text-muted-foreground">
                next retry {formatTimestamp(block.nextRetryAt)}
              </span>
            )}
            {block.lastFailureAt && (
              <span className="text-muted-foreground">
                last failure {formatTimestamp(block.lastFailureAt)}
              </span>
            )}
            {block.reason && <span className="basis-full break-words">{block.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
