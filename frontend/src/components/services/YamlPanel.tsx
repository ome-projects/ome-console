'use client'

import { useMemo, useState } from 'react'
import yaml from 'js-yaml'
import { Panel } from '@/components/ui/Panel'
import { CopyButton } from '@/components/ui/CopyButton'
import { Button } from '@/components/ui/Button'

interface YamlPanelProps {
  /** The object as the API server returned it, status included. */
  object: unknown
  title?: string
}

/** The object as YAML, with a copy button; collapsed until shown. */
export function YamlPanel({ object, title = 'YAML' }: YamlPanelProps) {
  const [open, setOpen] = useState(false)
  const text = useMemo(
    () => yaml.dump(object, { noRefs: true, lineWidth: -1, sortKeys: false }),
    [object]
  )

  return (
    <Panel
      title={title}
      description="The object as the API server returns it, status included"
      actions={
        <>
          <CopyButton text={text} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? 'Hide YAML' : 'Show YAML'}
          </Button>
        </>
      }
    >
      {open ? (
        <pre className="max-h-[36rem] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
          {text}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">
          {text.split('\n').length - 1} lines. Show the YAML or copy it to the clipboard.
        </p>
      )}
    </Panel>
  )
}
