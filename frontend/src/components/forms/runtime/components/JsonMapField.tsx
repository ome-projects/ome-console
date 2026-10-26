'use client'

import { useEffect, useRef, useState } from 'react'
import { isPlainObject } from '@/lib/utils/object'
import { getTextareaClassName } from '../../styles'

export type JsonMapValue = Record<string, string> | string | undefined

interface JsonMapFieldProps {
  id?: string
  /** The map, or the raw text while it is not valid JSON so the schema can reject it. */
  value: JsonMapValue
  onChange: (value: JsonMapValue) => void
  placeholder?: string
  error?: boolean
  'aria-label'?: string
}

function format(value: JsonMapValue): string {
  if (typeof value === 'string') return value
  return value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : ''
}

/** The map the text denotes; the text itself when it is not a JSON object of strings. */
function parse(text: string): JsonMapValue {
  if (!text.trim()) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    if (isPlainObject(parsed) && Object.values(parsed).every((v) => typeof v === 'string')) {
      return parsed as Record<string, string>
    }
  } catch {
    // Not JSON: fall through and keep the text so validation reports it.
  }
  return text
}

/**
 * A `map[string]string` edited as a JSON object. Invalid text is kept in the form as a string,
 * which the schema rejects, so the last valid map is never submitted behind the user's back.
 */
export function JsonMapField({
  id,
  value,
  onChange,
  placeholder,
  error,
  'aria-label': ariaLabel,
}: JsonMapFieldProps) {
  const [text, setText] = useState(() => format(value))
  const emitted = useRef<JsonMapValue>(value)

  // A value set from outside (the form loading an object) replaces the text; the user's own
  // edits are what the value already is and are left alone.
  useEffect(() => {
    if (JSON.stringify(value ?? null) === JSON.stringify(emitted.current ?? null)) return
    emitted.current = value
    setText(format(value))
  }, [value])

  const handleChange = (next: string) => {
    setText(next)
    const parsed = parse(next)
    emitted.current = parsed
    onChange(parsed)
  }

  return (
    <textarea
      id={id}
      value={text}
      onChange={(event) => handleChange(event.target.value)}
      className={getTextareaClassName({ error, mono: true })}
      placeholder={placeholder}
      spellCheck={false}
      aria-label={ariaLabel}
    />
  )
}
