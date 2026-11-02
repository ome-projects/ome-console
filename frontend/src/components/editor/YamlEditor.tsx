'use client'

import { useCallback, useId } from 'react'
import { clsx } from 'clsx'

export interface YamlEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  /** CSS height of the editor, e.g. `480px`. */
  height?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/**
 * A YAML text editor: monospace, two-space Tab, no auto-correction. It is a plain textarea so
 * the console needs no editor dependency; swapping in CodeMirror (`@uiw/react-codemirror` with
 * `@codemirror/lang-yaml`) only changes this file, the props stay the same.
 */
export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  height = '480px',
  placeholder,
  className,
  'aria-label': ariaLabel,
}: YamlEditorProps) {
  const id = useId()

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Tab' || readOnly || !onChange) return
      event.preventDefault()
      const target = event.currentTarget
      const { selectionStart, selectionEnd } = target
      const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
      onChange(next)
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 2
      })
    },
    [value, onChange, readOnly]
  )

  const lines = value.split('\n').length

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? 'YAML editor'}
      className={clsx('overflow-hidden rounded-lg border border-border bg-card text-sm', className)}
    >
      <div className="flex" style={{ height }}>
        <pre
          aria-hidden="true"
          className="m-0 select-none overflow-hidden border-r border-border bg-muted/30 px-2 py-3 text-right font-mono text-xs leading-5 text-muted-foreground"
        >
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </pre>
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className="h-full w-full resize-none bg-transparent px-3 py-3 font-mono text-xs leading-5 text-foreground outline-none"
        />
      </div>
    </div>
  )
}
