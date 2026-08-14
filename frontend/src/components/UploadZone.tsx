import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { MAX_BULK_FILES, MAX_UPLOAD_MB, useAudit } from '../context/AuditContext'

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    running,
    jobs,
    queueFiles,
    removeQueued,
    startImport,
    bulkNote,
    uploadError,
  } = useAudit()
  const [dragging, setDragging] = useState(false)

  const queued = jobs.filter((j) => j.status === 'queued')
  const canAdd = !running && jobs.length < MAX_BULK_FILES

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (running) return
    queueFiles(e.dataTransfer.files)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) queueFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <section
      className={[
        'upload-panel',
        compact ? 'is-compact' : '',
        dragging ? 'is-dragging' : '',
        running ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Upload call recordings"
      onDragEnter={(e) => {
        e.preventDefault()
        if (!running && canAdd) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        disabled={running || !canAdd}
        onChange={onChange}
      />

      <div className="upload-copy">
        <p className="panel-lede">
          {queued.length
            ? `${queued.length} queued — add more or press Start`
            : `Audio · ${MAX_UPLOAD_MB} MB · up to ${MAX_BULK_FILES}`}
        </p>
      </div>

      <div className="upload-actions">
        <button
          type="button"
          className="choose-btn"
          disabled={!canAdd}
          onClick={() => inputRef.current?.click()}
        >
          Add files
        </button>
        <button
          type="button"
          className="start-btn"
          disabled={running || queued.length === 0}
          onClick={() => {
            void startImport()
          }}
        >
          Start
        </button>
      </div>

      {queued.length > 0 && !compact && (
        <ul className="queue-list">
          {queued.map((j) => (
            <li key={j.key} className="queue-item">
              <span className="queue-name" title={j.name}>
                {j.name}
              </span>
              <span className="queue-meta">{j.sizeMb} MB</span>
              <button
                type="button"
                className="queue-remove"
                disabled={running}
                onClick={() => removeQueued(j.key)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {bulkNote && <p className="upload-note">{bulkNote}</p>}
      {uploadError && (
        <p className="upload-error" role="alert">
          {uploadError}
        </p>
      )}
    </section>
  )
}
