import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from '../lib/format'
import type { TranscriptSegment } from '../types'

interface TranscriptPlayerProps {
  segments: TranscriptSegment[]
  durationSec: number
  seekTo: number | null
  onSeekHandled: () => void
  audioSrc?: string | null
}

export function TranscriptPlayer({
  segments,
  durationSec,
  seekTo,
  onSeekHandled,
  audioSrc,
}: TranscriptPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const useRealAudio = Boolean(audioSrc)

  const activeId = useMemo(() => {
    const hit = segments.find((s) => currentTime >= s.start && currentTime < s.end)
    return hit?.id ?? null
  }, [segments, currentTime])

  useEffect(() => {
    if (useRealAudio) return
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
      return
    }

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const delta = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setCurrentTime((t) => {
        const next = t + delta
        if (next >= durationSec) {
          setPlaying(false)
          return durationSec
        }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, durationSec, useRealAudio])

  useEffect(() => {
    const a = audioRef.current
    if (!a || !useRealAudio) return
    if (playing) {
      void a.play().catch(() => setPlaying(false))
    } else {
      a.pause()
    }
  }, [playing, useRealAudio])

  useEffect(() => {
    if (seekTo == null) return
    setCurrentTime(seekTo)
    if (audioRef.current && useRealAudio) {
      audioRef.current.currentTime = seekTo
    }
    setPlaying(true)
    onSeekHandled()
  }, [seekTo, onSeekHandled, useRealAudio])

  useEffect(() => {
    if (!activeId || !listRef.current) return
    const el = listRef.current.querySelector(`[data-seg="${activeId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  const progress = durationSec > 0 ? (currentTime / durationSec) * 100 : 0

  function jumpTo(seconds: number) {
    setCurrentTime(seconds)
    if (audioRef.current && useRealAudio) {
      audioRef.current.currentTime = seconds
    }
    setPlaying(true)
  }

  return (
    <section className="transcript-panel" aria-label="Full transcript and audio player">
      <div className="section-kicker">Transcript</div>
      <h2 className="panel-title">Full call with clickable player</h2>
      <p className="panel-lede">
        {useRealAudio
          ? 'Live audio from CallProof — click any line or evidence timestamp to jump.'
          : 'Demo playback — click any line or evidence timestamp to jump.'}
      </p>

      {useRealAudio && audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            if (!durationSec && e.currentTarget.duration) {
              /* duration comes from audit; keep player in sync */
            }
          }}
        />
      )}

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
            max={Math.max(durationSec, 1)}
            step={0.1}
            value={currentTime}
            aria-label="Seek"
            onChange={(e) => jumpTo(Number(e.target.value))}
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
            <button type="button" onClick={() => jumpTo(seg.start)}>
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
