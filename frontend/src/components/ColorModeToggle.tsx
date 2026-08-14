import { useColorMode } from '../context/ColorMode'

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode()
  const toDark = mode === 'light'

  return (
    <button
      type="button"
      className="mode-toggle"
      aria-label={toDark ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-pressed={!toDark}
      title={toDark ? 'Dark theme' : 'Light theme'}
      onClick={toggle}
    >
      {toDark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.1 14.6A6.2 6.2 0 0 1 9.4 8.9 6.4 6.4 0 1 0 15.1 14.6Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M12 3.2v1.6M12 19.2v1.6M4.8 12H3.2M20.8 12h-1.6M6.2 6.2l1.1 1.1M16.7 16.7l1.1 1.1M17.8 6.2l-1.1 1.1M7.3 16.7l-1.1 1.1"
          />
        </svg>
      )}
    </button>
  )
}
