import { useId } from 'react'

type Surface = 'dark' | 'light'

interface BrandMarkProps {
  /** CSS pixel width — SVG scales crisply at any size */
  size?: number
  className?: string
  title?: string
}

/**
 * First-iteration Call Loop mark (hand-crafted):
 * infinity ribbon · handset left · soundwave bars right · blue→teal→purple
 */
export function BrandMark({ size = 40, className, title = 'CALL LOOP' }: BrandMarkProps) {
  const uid = useId().replace(/:/g, '')
  const g = `clm-${uid}`

  return (
    <svg
      className={['brand-mark', className].filter(Boolean).join(' ')}
      width={size}
      height={size * (72 / 120)}
      viewBox="0 0 120 72"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${g}-loop`} x1="6" y1="36" x2="114" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="48%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={`${g}-bars`} x1="72" y1="52" x2="100" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={`${g}-shine`} x1="20" y1="16" x2="102" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Continuous ribbon infinity */}
      <path
        d="M34 16
           C18 16 8 24.5 8 36
           C8 47.5 18 56 34 56
           C44.5 56 51.5 51.5 58.5 44.5
           C61.5 41.5 64.5 39.5 67.5 39.5
           C70.5 39.5 73.5 41.5 76.5 44.5
           C83.5 51.5 90.5 56 101 56
           C117 56 127 47.5 127 36
           C127 24.5 117 16 101 16
           C90.5 16 83.5 20.5 76.5 27.5
           C73.5 30.5 70.5 32.5 67.5 32.5
           C64.5 32.5 61.5 30.5 58.5 27.5
           C51.5 20.5 44.5 16 34 16Z"
        transform="translate(-7.5 0)"
        fill="none"
        stroke={`url(#${g}-loop)`}
        strokeWidth="11.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ribbon sheen */}
      <path
        d="M34 16
           C18 16 8 24.5 8 36
           C8 47.5 18 56 34 56
           C44.5 56 51.5 51.5 58.5 44.5
           C61.5 41.5 64.5 39.5 67.5 39.5
           C70.5 39.5 73.5 41.5 76.5 44.5
           C83.5 51.5 90.5 56 101 56
           C117 56 127 47.5 127 36
           C127 24.5 117 16 101 16
           C90.5 16 83.5 20.5 76.5 27.5
           C73.5 30.5 70.5 32.5 67.5 32.5
           C64.5 32.5 61.5 30.5 58.5 27.5
           C51.5 20.5 44.5 16 34 16Z"
        transform="translate(-7.5 0)"
        fill="none"
        stroke={`url(#${g}-shine)`}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* Handset cues on left loop */}
      <path
        d="M18 28c1.8-5.2 5.4-8.2 10.2-8.6"
        fill="none"
        stroke={`url(#${g}-loop)`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M18 44c1.8 5.2 5.4 8.2 10.2 8.6"
        fill="none"
        stroke={`url(#${g}-loop)`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* AI soundwave bars in right loop */}
      <g fill={`url(#${g}-bars)`}>
        <rect x="74.5" y="31" width="3.4" height="12" rx="1.7" />
        <rect x="80" y="26" width="3.4" height="17" rx="1.7" />
        <rect x="85.5" y="28.5" width="3.4" height="14.5" rx="1.7" />
        <rect x="91" y="23.5" width="3.4" height="19.5" rx="1.7" />
        <rect x="96.5" y="29.5" width="3.4" height="13.5" rx="1.7" />
      </g>
    </svg>
  )
}

interface BrandWordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  /** Match artwork: stacked mark over wordmark */
  stacked?: boolean
  showMark?: boolean
  /** dark: CALL white; light: CALL Midnight */
  surface?: Surface
  className?: string
}

export function BrandWordmark({
  size = 'md',
  stacked = false,
  showMark = true,
  surface = 'dark',
  className,
}: BrandWordmarkProps) {
  const markSize =
    size === 'hero' ? 108 : size === 'lg' ? 72 : size === 'sm' ? 44 : 56

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
      {showMark && <BrandMark size={markSize} />}
      <div className="brand-wordmark-text" aria-label="CALL LOOP">
        <span className="word-call">CALL</span>
        <span className="word-loop">LOOP</span>
      </div>
    </div>
  )
}

/** Primary brand entry used by layout / pages */
export function BrandLogo(props: BrandWordmarkProps) {
  return <BrandWordmark {...props} />
}
