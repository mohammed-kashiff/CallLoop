import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

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
  /** Isolates + Note tabs per call (or other entity). Required for per-call notes. */
  noteScopeKey?: string | null
}

interface NoteTab {
  id: string
  label: string
  body: string
}

const NOTES_STORAGE_KEY = 'callproof.workspace-notes.v1'

function readNotesStore(): Record<string, NoteTab[]> {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, NoteTab[]>
  } catch {
    return {}
  }
}

function writeNotesStore(store: Record<string, NoteTab[]>) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota / private mode
  }
}

export function Workspace({
  tabs,
  activeId,
  onActiveId,
  allowNotes = true,
  noteScopeKey = null,
}: WorkspaceProps) {
  const uid = useId()
  const scope = (noteScopeKey && String(noteScopeKey).trim()) || 'global'
  const [internal, setInternal] = useState(tabs[0]?.id ?? '')
  const [notesStore, setNotesStore] = useState<Record<string, NoteTab[]>>(() => readNotesStore())
  const active = activeId ?? internal

  const notes = useMemo(() => notesStore[scope] ?? [], [notesStore, scope])

  const setScopeNotes = (updater: (list: NoteTab[]) => NoteTab[]) => {
    setNotesStore((prev) => {
      const nextList = updater(prev[scope] ?? [])
      const next = { ...prev, [scope]: nextList }
      if (nextList.length === 0) {
        delete next[scope]
      }
      writeNotesStore(next)
      return next
    })
  }

  const all = [
    ...tabs.map((t) => ({ ...t, closable: false as const })),
    ...notes.map((n) => ({ id: n.id, label: n.label, closable: true as const })),
  ]

  const isNoteId = (id: string) => notes.some((n) => n.id === id) || /-note-\d+$/.test(id)

  useEffect(() => {
    if (!activeId && tabs[0] && !internal) setInternal(tabs[0].id)
  }, [tabs, activeId, internal])

  // Call changed while a note tab was open → return to the first content tab.
  useEffect(() => {
    if (!isNoteId(active)) return
    if (notes.some((n) => n.id === active)) return
    const fallback = tabs[0]?.id ?? ''
    if (!fallback) return
    onActiveId?.(fallback)
    if (activeId == null) setInternal(fallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when scope/active mismatch
  }, [scope])

  const setActive = (id: string) => {
    onActiveId?.(id)
    if (activeId == null) setInternal(id)
  }

  const addNote = () => {
    const n = notes.length + 1
    const id = `call-${scope}-note-${n}`
    setScopeNotes((list) => [...list, { id, label: `Note ${n}`, body: '' }])
    setActive(id)
  }

  const removeNote = (id: string) => {
    setScopeNotes((list) => list.filter((n) => n.id !== id))
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
              placeholder="Write a note for this call…"
              onChange={(e) => {
                const body = e.target.value
                setScopeNotes((list) =>
                  list.map((n) => (n.id === note.id ? { ...n, body } : n)),
                )
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
