import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface WorkspaceTab {
  id: string
  label: string
  panel?: ReactNode
}

interface WorkspaceProps {
  tabs: WorkspaceTab[]
  activeId?: string
  onActiveId?: (id: string) => void
  allowNotes?: boolean
}

interface NoteTab {
  id: string
  label: string
  body: string
}

export function Workspace({ tabs, activeId, onActiveId, allowNotes = true }: WorkspaceProps) {
  const uid = useId()
  const [internal, setInternal] = useState(tabs[0]?.id ?? '')
  const [notes, setNotes] = useState<NoteTab[]>([])
  const active = activeId ?? internal

  const all = [
    ...tabs.map((t) => ({ ...t, closable: false as const })),
    ...notes.map((n) => ({ id: n.id, label: n.label, closable: true as const })),
  ]

  useEffect(() => {
    if (!activeId && tabs[0] && !internal) setInternal(tabs[0].id)
  }, [tabs, activeId, internal])

  const setActive = (id: string) => {
    onActiveId?.(id)
    if (activeId == null) setInternal(id)
  }

  const addNote = () => {
    const n = notes.length + 1
    const id = `${uid}-note-${n}`
    setNotes((list) => [...list, { id, label: `Note ${n}`, body: '' }])
    setActive(id)
  }

  const removeNote = (id: string) => {
    setNotes((list) => list.filter((n) => n.id !== id))
    if (active === id) setActive(tabs[0]?.id ?? '')
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = all.findIndex((t) => t.id === active)
    if (i < 0) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActive(all[(i + 1) % all.length].id)
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive(all[(i - 1 + all.length) % all.length].id)
    }
  }

  const note = notes.find((n) => n.id === active)
  const panel = tabs.find((t) => t.id === active)?.panel

  return (
    <div className="workspace">
      <div className="tablist" role="tablist" aria-label="Workspace" onKeyDown={onKey}>
        {all.map((t) => (
          <div key={t.id} className="tab-item">
            <button
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`${uid}-panel-${t.id}`}
              className={['tab', active === t.id ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
            {t.closable ? (
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${t.label}`}
                onClick={() => removeNote(t.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {allowNotes && (
          <button type="button" className="tab-add" onClick={addNote}>
            + Note
          </button>
        )}
      </div>

      <div
        role="tabpanel"
        id={`${uid}-panel-${active}`}
        aria-labelledby={`${uid}-tab-${active}`}
        className="tab-panel"
      >
        {note ? (
          <label className="note-label">
            <span className="visually-hidden">{note.label}</span>
            <textarea
              className="note-field"
              value={note.body}
              maxLength={8000}
              placeholder="Write a note…"
              onChange={(e) => {
                const body = e.target.value
                setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, body } : n)))
              }}
            />
          </label>
        ) : (
          panel
        )}
      </div>
    </div>
  )
}
