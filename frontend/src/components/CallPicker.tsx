import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { capFirst, formatTime } from '../lib/format'
import type { CallListItem } from '../types'

interface CallPickerProps {
  calls: CallListItem[]
  value: number | null
  disabled?: boolean
  onChange: (id: number) => void
  placeholder?: string
}

function shortName(name: string, max = 22) {
  const n = capFirst((name || '').trim())
  if (n.length <= max) return n
  return `${n.slice(0, max - 1)}…`
}

function scoreTone(score: number | null): 'good' | 'mid' | 'low' | 'none' {
  if (score == null) return 'none'
  if (score >= 80) return 'good'
  if (score >= 60) return 'mid'
  return 'low'
}

export function CallPicker({
  calls,
  value,
  disabled = false,
  onChange,
  placeholder = 'Select a call…',
}: CallPickerProps) {
  const uid = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = useMemo(
    () => calls.find((c) => c.id === value) ?? null,
    [calls, value],
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!calls.length) return null

  const triggerLabel = selected
    ? `#${selected.id} · ${shortName(selected.filename)}`
    : placeholder

  return (
    <div className={['call-picker', open ? 'is-open' : ''].join(' ')} ref={rootRef}>
      <span className="call-picker-label" id={`${uid}-label`}>
        Call
      </span>
      <button
        type="button"
        className="call-picker-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${uid}-label`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="call-picker-trigger-text" title={selected?.filename || placeholder}>
          {triggerLabel}
        </span>
        {selected?.score != null && (
          <span className={`call-picker-chip is-${scoreTone(selected.score)}`}>
            {selected.score}
          </span>
        )}
        <span className="call-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul
          className="call-picker-menu"
          role="listbox"
          aria-labelledby={`${uid}-label`}
        >
          {calls.map((c) => {
            const active = c.id === value
            const tone = scoreTone(c.score)
            return (
              <li key={c.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={['call-picker-option', active ? 'is-active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setOpen(false)
                    if (c.id !== value) onChange(c.id)
                  }}
                >
                  <span className="call-picker-option-main">
                    <span className="call-picker-option-id">#{c.id}</span>
                    <span className="call-picker-option-name" title={c.filename}>
                      {shortName(c.filename, 24)}
                    </span>
                  </span>
                  <span className="call-picker-option-meta">
                    {c.audio_seconds != null ? formatTime(c.audio_seconds) : '—'}
                    {c.score != null && (
                      <span className={`call-picker-chip is-${tone}`}>{c.score}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
