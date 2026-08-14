import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from '../lib/format'
import type { TranscriptSegment } from '../types'

interface TranscriptPlayerProps {
  segments: TranscriptSegment[]
  durationSec: number
  seekTo: number | null
  audioUrl?: string | null
  onSeekHandled: () => void
}

export function TranscriptPlayer({
  segments,
  durationSec,
  seekTo,
  audioUrl,
  onSeekHandled,
}: TranscriptPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const activeId = useMemo(() => {
    const hit = segments.find((s) => currentTime >= s.start && currentTime < s.end)
    return hit?.id ?? null
  }, [segments, currentTime])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      void a.play().catch(() => setPlaying(false))
    } else {
      a.pause()
    }
  }, [playing])

  useEffect(() => {
    if (seekTo == null) return
    const a = audioRef.current
    if (a) {
      a.currentTime = seekTo
      void a.play().catch(() => {})
    }
    setCurrentTime(seekTo)
    setPlaying(true)
    onSeekHandled()
  }, [seekTo, onSeekHandled])

  useEffect(() => {
    if (!activeId || !listRef.current) return
    const el = listRef.current.querySelector(`[data-seg="${activeId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  const progress = durationSec > 0 ? (currentTime / durationSec) * 100 : 0

  const jump = (seconds: number) => {
    const a = audioRef.current
    if (a) {
      a.currentTime = seconds
      void a.play().catch(() => {})
    }
    setCurrentTime(seconds)
    setPlaying(true)
  }

  return (
    <section className="transcript-panel" aria-label="Full transcript and audio player">
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      ) : null}
      <div className="player" role="group" aria-label="Audio player">
        <button
          type="button"
          className="play-btn"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="player-track">
          <input
            type="range"
            min={0}
            max={durationSec || 1}
            step={0.1}
            value={currentTime}
            aria-label="Seek"
            onChange={(e) => jump(Number(e.target.value))}
          />
          <div className="player-wave" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, i) => (
              <span
                key={i}
                style={{
                  height: `${28 + ((i * 37) % 48)}%`,
                  opacity: (i / 48) * 100 < progress ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </div>
        <div className="player-time">
          {formatTime(currentTime)} / {formatTime(durationSec)}
        </div>
      </div>

      <ul className="transcript-list" ref={listRef}>
        {segments.map((seg) => (
          <li
            key={seg.id}
            data-seg={seg.id}
            className={[
              'transcript-line',
              seg.speaker,
              activeId === seg.id ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <button type="button" onClick={() => jump(seg.start)}>
              <span className="speaker">{seg.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
              <span className="time">{formatTime(seg.start)}</span>
              <span className="text">{seg.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
