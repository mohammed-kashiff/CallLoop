import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { formatBytes } from '../lib/format'

const MAX_BYTES = 25 * 1024 * 1024

interface UploadZoneProps {
  disabled?: boolean
  onValidFile: (file: File) => void
  onDemo?: () => void
}

export function UploadZone({ disabled, onValidFile, onDemo }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const validate = useCallback(
    (file: File | undefined) => {
      if (!file) return
      setError(null)

      const isMp3 =
        file.type === 'audio/mpeg' ||
        file.type === 'audio/mp3' ||
        file.name.toLowerCase().endsWith('.mp3')

      if (!isMp3) {
        setError('Only MP3 recordings are accepted.')
        return
      }
      if (file.size > MAX_BYTES) {
        setError(`File is ${formatBytes(file.size)}. Maximum size is 25 MB.`)
        return
      }

      setSelectedName(file.name)
      onValidFile(file)
    },
    [onValidFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    validate(e.dataTransfer.files?.[0])
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    validate(e.target.files?.[0])
    e.target.value = ''
  }

  return (
    <section className="upload-panel" aria-label="Upload call recording">
      <div className="section-kicker">Step 1 — Upload</div>
      <h2 className="panel-title">Drop a call recording</h2>
      <p className="panel-lede">
        Drag and drop an MP3 into CALL LOOP. Files over 25 MB are rejected immediately. Duplicate
        fingerprints skip re-processing.
      </p>

      <div
        className={['dropzone', dragging ? 'is-dragging' : '', disabled ? 'is-disabled' : '']
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          hidden
          disabled={disabled}
          onChange={onChange}
        />
        <div className="dropzone-orb" aria-hidden="true" />
        <p className="dropzone-title">MP3 call recording</p>
        <p className="dropzone-hint">Max 25 MB · uploaded to CallProof API</p>
        {selectedName && !error && (
          <p className="dropzone-file">Selected: {selectedName}</p>
        )}
      </div>

      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}

      {onDemo && (
        <button
          type="button"
          className="demo-btn"
          disabled={disabled}
          onClick={onDemo}
        >
          Or run sample audit (offline demo)
        </button>
      )}
    </section>
  )
}
