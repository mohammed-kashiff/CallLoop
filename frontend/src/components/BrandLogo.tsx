import { useEffect, useId, useState } from 'react'

type Surface = 'dark' | 'light'

const LOGO_MP4 = '/brand/logo-loop.mp4?v=3'

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduce(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return reduce
}

interface BrandMotionProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  surface?: Surface
  className?: string
}

/** Animated logo. Falls back to the SVG mark if the file is missing or motion is reduced. */
export function BrandMotion({ size = 'sm', surface = 'light', className }: BrandMotionProps) {
  const reduce = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)
  const markSize = size === 'hero' ? 280 : size === 'lg' ? 48 : size === 'sm' ? 28 : 36

  if (reduce || failed) {
    return <BrandMark size={markSize} surface={surface} className={className} />
  }

  return (
    <video
      className={['brand-motion', `is-${size}`, className].filter(Boolean).join(' ')}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-label="CALL LOOP"
      onError={() => setFailed(true)}
    >
      <source src={LOGO_MP4} type="video/mp4" />
    </video>
  )
}

interface BrandMarkProps {
  size?: number
  className?: string
  title?: string
  surface?: Surface
}

/**
 * V2 mark: an open C, closed by a Teal arc, Purple node at the join.
 */
export function BrandMark({
  size = 32,
  className,
  title = 'CALL LOOP',
  surface = 'light',
}: BrandMarkProps) {
  const uid = useId().replace(/:/g, '')
  const g = `clm-${uid}`
  const openStroke = surface === 'dark' ? '#F4F6FB' : '#0B1F44'

  return (
    <svg
      className={['brand-mark', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${g}-close`} x1="34" y1="10" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <path
        d="M33.64 35.49 A 15 15 0 1 1 33.64 12.51"
        fill="none"
        stroke={openStroke}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M33.64 12.51 A 15 15 0 0 1 33.64 35.49"
        fill="none"
        stroke={`url(#${g}-close)`}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <circle cx="33.64" cy="12.51" r="2.6" fill="#8B5CF6" />
    </svg>
  )
}

interface BrandWordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  stacked?: boolean
  showMark?: boolean
  animate?: boolean
  surface?: Surface
  className?: string
}

export function BrandWordmark({
  size = 'md',
  stacked = false,
  showMark = true,
  animate = true,
  surface = 'light',
  className,
}: BrandWordmarkProps) {
  const markSize = size === 'hero' ? 72 : size === 'lg' ? 48 : size === 'sm' ? 28 : 36

  return (
    <div
      className={[
        'brand-wordmark',
        `is-${size}`,
        stacked ? 'is-stacked' : 'is-inline',
        `surface-${surface}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-surface={surface}
    >
      {showMark &&
        (animate ? (
          <BrandMotion size={size} surface={surface} />
        ) : (
          <BrandMark size={markSize} surface={surface} />
        ))}
      <div className="brand-wordmark-text" aria-label="CALL LOOP">
        <span className="word-call">CALL</span>
        <span className="word-loop">LOOP</span>
      </div>
    </div>
  )
}

export function BrandLogo(props: BrandWordmarkProps) {
  return <BrandWordmark {...props} />
}
