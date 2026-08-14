import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'

export type SketchVariant = 'pulse' | 'feedbacks' | 'churn' | 'neighbourhood' | 'training'

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEEDS: Record<SketchVariant, number> = {
  pulse: 0xa11ce,
  feedbacks: 0xf33db,
  churn: 0xc4a4e,
  neighbourhood: 0xb10c4,
  training: 0x71a1e,
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  )
}

const PULSE: ReactNode[] = [
  <Frame key="handset">
    <path d="M14 18.5c1.2-6.8 8.6-9.2 13.8-4.2l3.4 3.6c1.2 1.3.8 3.6-.7 4.6l-2.6 1.8c5.6 6.4 12.4 11.2 19.8 14.2l2.2-2.6c1.1-1.3 3.4-1.6 4.7-.4l4.2 3.4c4.2 3.4 3.6 10.2-1.8 12.4-9.6 4-22.4.8-34.6-11.6C10.2 28.2 9.4 22.4 14 18.5Z" />
  </Frame>,
  <Frame key="waves">
    <path d="M18 30c4.5-4.2 4.5-11.8 0-16" />
    <path d="M24 34c8-7 8-19 0-26" />
    <path d="M30 38c11.5-9.5 11.5-26.5 0-36" />
    <path d="M12 26c2.2-2 2.2-6 0-8" />
  </Frame>,
  <Frame key="phones">
    <path d="M12 28v-4.5C12 14.6 19.4 8 28 8s16 6.6 16 15.5V28" />
    <rect x="8" y="26" width="10" height="14" rx="4" />
    <rect x="34" y="26" width="10" height="14" rx="4" />
    <path d="M13 32h4M35 32h4" />
  </Frame>,
  <Frame key="loop">
    <path d="M33.2 34.2A14 14 0 1 1 33.2 13.8" />
    <path d="M33.2 13.8A14 14 0 0 1 33.2 34.2" />
    <circle cx="33.2" cy="13.8" r="2.1" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="mic">
    <rect x="18" y="6" width="12" height="20" rx="6" />
    <path d="M14 22a10 10 0 0 0 20 0" />
    <path d="M24 32v8M17 40h14" />
    <path d="M21 12h6M21 16h6" />
  </Frame>,
  <Frame key="eq">
    <path d="M10 36V22M18 36V12M26 36V18M34 36V8M42 36V24" />
  </Frame>,
  <Frame key="play">
    <circle cx="24" cy="24" r="16.5" />
    <path d="M20 16.5 33 24 20 31.5Z" />
  </Frame>,
  <Frame key="wave">
    <path d="M4 26 10 14l6 22 6-16 6 10 6-8 6 12 6-20" />
  </Frame>,
  <Frame key="speaker">
    <path d="M8 18h8l10-8v28L16 30H8a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2Z" />
    <path d="M32 18c3.5 3 3.5 9 0 12" />
    <path d="M36 14c6 6 6 14 0 20" />
  </Frame>,
  <Frame key="record">
    <circle cx="24" cy="24" r="16" />
    <circle cx="24" cy="24" r="5.5" />
    <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="radio">
    <rect x="7" y="16" width="34" height="22" rx="4" />
    <path d="M12 16 32 8" />
    <circle cx="18" cy="27" r="5" />
    <path d="M28 23h8M28 29h6" />
  </Frame>,
]

const FEEDBACKS: ReactNode[] = [
  <Frame key="bubble">
    <path d="M8 10h28a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H20l-8 7v-7H8a4 4 0 0 1-4-4V16a6 6 0 0 1 6-6Z" />
    <path d="M14 20h16M14 26h10" />
  </Frame>,
  <Frame key="quotes">
    <path d="M10 30c0-9 5.5-14.5 12.5-16.5V20c-4 .8-6.5 4-6.5 8h6.5v10H10V30Z" />
    <path d="M27 30c0-9 5.5-14.5 12.5-16.5V20c-4 .8-6.5 4-6.5 8H40v10H27V30Z" />
  </Frame>,
  <Frame key="dots">
    <path d="M8 12h26a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-6v6l-8-6H8a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5Z" />
    <circle cx="16" cy="23" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="24" cy="23" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="32" cy="23" r="1.8" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="star">
    <path d="M24 6 28.2 18.4H41L30.8 26l3.8 12.4L24 31.2 13.4 38.4 17.2 26 7 18.4h12.8Z" />
  </Frame>,
  <Frame key="mail">
    <rect x="6" y="12" width="36" height="24" rx="4" />
    <path d="M7 14.5 24 27 41 14.5" />
  </Frame>,
  <Frame key="stack">
    <rect x="12" y="8" width="28" height="18" rx="5" />
    <rect x="7" y="16" width="28" height="18" rx="5" />
    <path d="M13 25h14" />
  </Frame>,
  <Frame key="thumb">
    <path d="M18 24V14.5c0-3.6 2.6-7 7-7 1.7 0 2.6 1.8 2.6 3.4V20h10.2c2.6 0 4.2 2.6 3.4 5.2L37 40H18" />
    <rect x="8" y="24" width="10" height="16" rx="2" />
  </Frame>,
  <Frame key="note">
    <path d="M12 8h18l10 10v22H12z" />
    <path d="M30 8v10h10" />
    <path d="M18 26h12M18 32h8" />
  </Frame>,
  <Frame key="mega">
    <path d="M6 22h10l20-10v24L16 26H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z" />
    <path d="M16 26v6a4 4 0 0 0 4 4" />
    <path d="M38 18c2.4 2 2.4 10 0 12" />
  </Frame>,
  <Frame key="at">
    <circle cx="24" cy="24" r="14" />
    <circle cx="24" cy="24" r="5.5" />
    <path d="M29.5 24v-1.2c0-3 1.6-5.3 4.2-5.3" />
  </Frame>,
  <Frame key="clip">
    <rect x="12" y="10" width="24" height="30" rx="3" />
    <rect x="18" y="6" width="12" height="8" rx="2" />
    <path d="M18 24h12M18 30h8" />
  </Frame>,
]

const CHURN: ReactNode[] = [
  <Frame key="warn">
    <path d="M24 7 43 40H5Z" />
    <path d="M24 20v10M24 35.5v.5" />
  </Frame>,
  <Frame key="chart">
    <path d="M8 8v32h32" />
    <path d="M12 18 22 28 30 16l10 18" />
  </Frame>,
  <Frame key="glass">
    <path d="M16 8h16M16 40h16" />
    <path d="M18 8c0 10 6 12 6 16s-6 6-6 16" />
    <path d="M30 8c0 10-6 12-6 16s6 6 6 16" />
  </Frame>,
  <Frame key="shield">
    <path d="M24 6 40 13v14c0 10-7 18-16 21C15 45 8 37 8 27V13Z" />
    <path d="M17 25l5.5 5.5L32 20" />
  </Frame>,
  <Frame key="clock">
    <circle cx="24" cy="24" r="16" />
    <path d="M24 12v13l8 5" />
  </Frame>,
  <Frame key="link">
    <path d="M20 18.5c-3.6-3.6-9.6-3.6-13.2 0s-3.6 9.6 0 13.2 9.6 3.6 13.2 0" />
    <path d="M28 29.5c3.6 3.6 9.6 3.6 13.2 0s3.6-9.6 0-13.2-9.6-3.6-13.2 0" />
    <path d="M22 8l3 3M16 40l-3 3" />
  </Frame>,
  <Frame key="bell">
    <path d="M14 22a10 10 0 0 1 20 0v10H14z" />
    <path d="M12 32h24M21 38a3 3 0 0 0 6 0" />
  </Frame>,
  <Frame key="spark">
    <path d="M6 16 16 30 26 12 36 34 44 20" />
  </Frame>,
  <Frame key="exit">
    <rect x="8" y="8" width="18" height="32" rx="2" />
    <path d="M32 24h12m-5-5 5 5-5 5" />
    <circle cx="20" cy="24" r="1.4" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="gauge">
    <path d="M8 32a16 16 0 0 1 32 0" />
    <path d="M24 32 33 18" />
    <circle cx="24" cy="32" r="2.2" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="umbrella">
    <path d="M8 24c0-9 7.2-16 16-16s16 7 16 16H8Z" />
    <path d="M24 24v14a4 4 0 0 0 8 0" />
  </Frame>,
]

const NEIGHBOURHOOD: ReactNode[] = [
  <Frame key="house">
    <path d="M8 24 24 10 40 24" />
    <path d="M12 22.5V40h24V22.5" />
    <rect x="20" y="28" width="8" height="12" rx="1" />
    <rect x="15" y="26" width="6" height="6" rx="0.8" />
    <path d="M15 29h6M18 26v6" />
  </Frame>,
  <Frame key="cottage">
    <path d="M7 26 24 9 41 26" />
    <path d="M11 24v16h26V24" />
    <path d="M30 14v-6h6v10" />
    <rect x="19" y="30" width="10" height="10" rx="1" />
    <circle cx="26.5" cy="35" r="0.7" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="street">
    <path d="M6 18h36M6 30h36" />
    <path d="M14 24h5M22.5 24h5M31 24h5" />
  </Frame>,
  <Frame key="lamp">
    <path d="M24 42V18" />
    <path d="M16 18c0-6 3.6-10 8-10s8 4 8 10" />
    <path d="M16 18h16" />
    <path d="M18 42h12" />
    <circle cx="24" cy="20.5" r="2.2" />
  </Frame>,
  <Frame key="mailbox">
    <rect x="10" y="14" width="26" height="14" rx="4" />
    <path d="M24 28v12M18 40h12" />
    <path d="M32 12v8" />
    <path d="M29 12h8" />
  </Frame>,
  <Frame key="tree">
    <path d="M24 42V26" />
    <path d="M24 28c-8 0-12-6-12-12 0-7 5-10 12-10s12 3 12 10c0 6-4 12-12 12Z" />
    <path d="M18 42h12" />
  </Frame>,
  <Frame key="fence">
    <path d="M8 20v16M16 16v20M24 20v16M32 16v20M40 20v16" />
    <path d="M6 26h36M6 34h36" />
  </Frame>,
  <Frame key="window">
    <rect x="10" y="10" width="28" height="28" rx="2" />
    <path d="M24 10v28M10 24h28" />
  </Frame>,
  <Frame key="hydrant">
    <path d="M18 42V22a6 6 0 0 1 12 0v20" />
    <path d="M14 26h20M16 42h16" />
    <path d="M18 16h12" />
  </Frame>,
  <Frame key="bench">
    <path d="M8 26h32" />
    <path d="M12 26v12M36 26v12" />
    <path d="M8 22h32" />
    <path d="M10 38h6M32 38h6" />
  </Frame>,
  <Frame key="sign">
    <rect x="12" y="8" width="24" height="16" rx="2" />
    <path d="M24 24v18M18 42h12" />
    <path d="M17 14h14M17 18h10" />
  </Frame>,
  <Frame key="steps">
    <path d="M8 36h12v-8h12v-8h12" />
    <path d="M8 36v6h36V20" />
  </Frame>,
]

const TRAINING: ReactNode[] = [
  <Frame key="cap">
    <path d="M6 22 24 12 42 22 24 32Z" />
    <path d="M14 26v8c0 2.4 4.4 5 10 5s10-2.6 10-5v-8" />
    <path d="M42 22v12" />
  </Frame>,
  <Frame key="book">
    <path d="M8 10h13a5 5 0 0 1 5 5v23a5 5 0 0 0-5-5H8V10Z" />
    <path d="M40 10H27a5 5 0 0 0-5 5v23a5 5 0 0 1 5-5h13V10Z" />
  </Frame>,
  <Frame key="pencil">
    <path d="M30 8 40 18 18 40H8V30Z" />
    <path d="M26 12 36 22" />
    <path d="M8 30l10 10" />
  </Frame>,
  <Frame key="board">
    <rect x="8" y="10" width="32" height="22" rx="2" />
    <path d="M24 32v8M16 40h16" />
    <path d="M14 18h20M14 24h14" />
  </Frame>,
  <Frame key="target">
    <circle cx="24" cy="24" r="16" />
    <circle cx="24" cy="24" r="10" />
    <circle cx="24" cy="24" r="4" />
  </Frame>,
  <Frame key="list">
    <rect x="10" y="8" width="28" height="32" rx="3" />
    <path d="M16 18h16M16 24h16M16 30h10" />
    <path d="M14 18l2 2 4-4" />
  </Frame>,
  <Frame key="medal">
    <circle cx="24" cy="28" r="10" />
    <path d="M16 8 24 18 32 8" />
    <path d="M21 28h6M24 25v6" />
  </Frame>,
  <Frame key="flag">
    <path d="M10 8v32" />
    <path d="M10 10h22l-5 7 5 7H10" />
  </Frame>,
  <Frame key="bulb">
    <path d="M16 26a8 8 0 1 1 12 0c-1.6 1.6-2.4 3-2.4 6H18.4c0-3-.8-4.4-2.4-6Z" />
    <path d="M18 36h12M20 40h8" />
  </Frame>,
  <Frame key="path">
    <circle cx="10" cy="34" r="4" />
    <circle cx="24" cy="20" r="4" />
    <circle cx="38" cy="12" r="4" />
    <path d="M13.5 31.2 20.6 22.8M27.4 17.6 34.6 13.8" />
  </Frame>,
  <Frame key="whistle">
    <rect x="6" y="18" width="22" height="12" rx="6" />
    <path d="M28 22h10v8H28" />
    <circle cx="16" cy="24" r="2.2" />
  </Frame>,
]

const SETS: Record<SketchVariant, ReactNode[]> = {
  pulse: PULSE,
  feedbacks: FEEDBACKS,
  churn: CHURN,
  neighbourhood: NEIGHBOURHOOD,
  training: TRAINING,
}

const FILLERS: ReactNode[] = [
  <Frame key="star-s">
    <path d="M24 8 27 20h12L29 27l4 12-9-7-9 7 4-12-10-7h12Z" />
  </Frame>,
  <Frame key="spark-s">
    <path d="M24 6v10M24 32v10M6 24h10M32 24h10M12 12l7 7M29 29l7 7M36 12l-7 7M19 29l-7 7" />
  </Frame>,
  <Frame key="plus">
    <path d="M24 10v28M10 24h28" />
  </Frame>,
  <Frame key="x">
    <path d="M14 14l20 20M34 14 14 34" />
  </Frame>,
  <Frame key="ring">
    <circle cx="24" cy="24" r="9" />
  </Frame>,
  <Frame key="dot">
    <circle cx="24" cy="24" r="3.2" fill="currentColor" stroke="none" />
  </Frame>,
  <Frame key="dash">
    <path d="M10 24h28" />
  </Frame>,
  <Frame key="squiggle">
    <path d="M8 26c6-10 10 10 16 0s10 10 16 0" />
  </Frame>,
  <Frame key="burst">
    <path d="M24 8l2 12 12-2-10 8 8 10-12-6-6 12-2-12-12 2 10-8-8-10 12 6Z" />
  </Frame>,
  <Frame key="hash">
    <path d="M16 14v20M32 14v20M12 20h24M12 28h24" />
  </Frame>,
  <Frame key="mini-wave">
    <path d="M8 24c4-8 8 8 12 0s8 8 12 0 8 8 12 0" />
  </Frame>,
  <Frame key="heart-s">
    <path d="M24 38s-14-9-14-18c0-5 4-8 8-8 3 0 6 2 6 5 0-3 3-5 6-5 4 0 8 3 8 8 0 9-14 18-14 18Z" />
  </Frame>,
]

interface Mark {
  id: number
  icon: number
  rotate: number
  scale: number
  fill: boolean
}

function layout(variant: SketchVariant, total: number): Mark[] {
  const rand = mulberry32(SEEDS[variant] + total * 17)
  const icons = SETS[variant]
  const marks: Mark[] = []
  let lastTheme = -1

  for (let i = 0; i < total; i += 1) {
    const fill = rand() < 0.3
    const pool = fill ? FILLERS.length : icons.length
    let icon = Math.floor(rand() * pool)
    if (!fill && icon === lastTheme) icon = (icon + 1) % pool
    if (!fill) lastTheme = icon
    marks.push({
      id: i,
      icon,
      fill,
      rotate: (rand() - 0.5) * 34,
      scale: fill ? 0.62 + rand() * 0.2 : 0.82 + rand() * 0.14,
    })
  }

  return marks
}

const CELL = 36

export function SketchWallpaper({ variant }: { variant: SketchVariant }) {
  const ref = useRef<HTMLDivElement>(null)
  const [grid, setGrid] = useState({ cols: 20, rows: 12 })
  const marks = useMemo(() => layout(variant, grid.cols * grid.rows), [variant, grid])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = () => {
      const cols = Math.max(8, Math.floor(el.clientWidth / CELL))
      const rows = Math.max(6, Math.floor(el.clientHeight / CELL))
      setGrid((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }))
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="sketch-wallpaper"
      aria-hidden="true"
      style={{ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties}
    >
      {marks.map((mark) => {
        const source = mark.fill ? FILLERS[mark.icon] : SETS[variant][mark.icon]
        return (
          <span
            key={mark.id}
            className={mark.fill ? 'sketch-mark is-fill' : 'sketch-mark'}
            style={
              {
                '--r': `${mark.rotate}deg`,
                '--s': mark.scale,
              } as CSSProperties
            }
          >
            {isValidElement(source) ? cloneElement(source as ReactElement, { key: mark.id }) : source}
          </span>
        )
      })}
    </div>
  )
}
