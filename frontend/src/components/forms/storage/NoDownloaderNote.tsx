'use client'

import { clsx } from 'clsx'
import { hasNoDownloader, storageUriScheme } from '@/lib/utils/storage-uri'

interface NoDownloaderNoteProps {
  /** A storage URI or its scheme ("s3"). */
  uriOrScheme: string
  className?: string
}

/**
 * OME v1.3 accepts s3://, az://, gs:// and github:// URIs but has no downloader for them: the
 * model agent handles no such task, so no node ever reports the model ready (ome-docs
 * concepts/models/base-models.md, "No downloader for S3, Azure, GCS or GitHub").
 */
export function NoDownloaderNote({ uriOrScheme, className }: NoDownloaderNoteProps) {
  if (!hasNoDownloader(uriOrScheme)) return null
  const scheme = uriOrScheme.includes('://') ? storageUriScheme(uriOrScheme) : uriOrScheme
  return (
    <p
      className={clsx(
        'rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground',
        className
      )}
    >
      OME has no downloader for <code>{scheme}://</code> in v1.3. It accepts the model, but nothing
      fetches the weights and no node reports them ready, so the model stays <code>In_Transit</code>
      . To serve weights that you copy to the nodes yourself, use <code>local://</code>.
    </p>
  )
}
