import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ColorMode = 'light' | 'dark'

const STORAGE_KEY = 'call-loop-color-mode'

function isMode(value: string | null | undefined): value is ColorMode {
  return value === 'light' || value === 'dark'
}

function readStoredMode(): ColorMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isMode(stored) ? stored : null
  } catch {
    return null
  }
}

export function preferredMode(): ColorMode {
  const stored = readStoredMode()
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode
  document.documentElement.style.colorScheme = mode
}

interface ColorModeContextValue {
  mode: ColorMode
  setMode: (mode: ColorMode) => void
  toggle: () => void
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null)

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(() => {
    const fromDom = document.documentElement.dataset.colorMode
    return isMode(fromDom) ? fromDom : preferredMode()
  })

  useEffect(() => {
    applyColorMode(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* private mode / quota */
    }
  }, [mode])

  const setMode = useCallback((next: ColorMode) => {
    if (!isMode(next)) return
    setModeState(next)
  }, [])

  const toggle = useCallback(() => {
    setModeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(() => ({ mode, setMode, toggle }), [mode, setMode, toggle])

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext)
  if (!ctx) {
    throw new Error('useColorMode must be used within ColorModeProvider')
  }
  return ctx
}
