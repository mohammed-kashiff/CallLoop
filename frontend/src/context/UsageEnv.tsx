import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type WorkspaceEnv = 'sandbox' | 'production'

const ENV_KEY = 'call-loop-env'
const USAGE_KEY = 'call-loop-usage'

const LIMITS: Record<WorkspaceEnv, number> = {
  sandbox: 25,
  production: 500,
}

const DEFAULT_USED: Record<WorkspaceEnv, number> = {
  sandbox: 8,
  production: 86,
}

function isEnv(value: string | null | undefined): value is WorkspaceEnv {
  return value === 'sandbox' || value === 'production'
}

function clampUsed(value: unknown, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(limit, Math.max(0, Math.floor(value)))
}

function readEnv(): WorkspaceEnv {
  try {
    const stored = localStorage.getItem(ENV_KEY)
    if (isEnv(stored)) return stored
  } catch {
    /* private mode */
  }
  return 'sandbox'
}

function readUsed(): Record<WorkspaceEnv, number> {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (!raw) return { ...DEFAULT_USED }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_USED }
    const record = parsed as Record<string, unknown>
    return {
      sandbox: clampUsed(record.sandbox, LIMITS.sandbox),
      production: clampUsed(record.production, LIMITS.production),
    }
  } catch {
    return { ...DEFAULT_USED }
  }
}

interface UsageEnvValue {
  env: WorkspaceEnv
  setEnv: (env: WorkspaceEnv) => void
  used: number
  limit: number
  remaining: number
  percent: number
  atLimit: boolean
  recordCall: () => void
}

const UsageEnvContext = createContext<UsageEnvValue | null>(null)

export function UsageEnvProvider({ children }: { children: ReactNode }) {
  const [env, setEnvState] = useState<WorkspaceEnv>(() => readEnv())
  const [usedByEnv, setUsedByEnv] = useState<Record<WorkspaceEnv, number>>(() => readUsed())

  useEffect(() => {
    try {
      localStorage.setItem(ENV_KEY, env)
    } catch {
      /* private mode / quota */
    }
  }, [env])

  useEffect(() => {
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(usedByEnv))
    } catch {
      /* private mode / quota */
    }
  }, [usedByEnv])

  const setEnv = useCallback((next: WorkspaceEnv) => {
    if (!isEnv(next)) return
    setEnvState(next)
  }, [])

  const recordCall = useCallback(() => {
    setUsedByEnv((current) => {
      const limit = LIMITS[env]
      const next = Math.min(limit, current[env] + 1)
      if (next === current[env]) return current
      return { ...current, [env]: next }
    })
  }, [env])

  const used = usedByEnv[env]
  const limit = LIMITS[env]
  const remaining = Math.max(0, limit - used)
  const percent = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))

  const value = useMemo(
    () => ({
      env,
      setEnv,
      used,
      limit,
      remaining,
      percent,
      atLimit: remaining === 0,
      recordCall,
    }),
    [env, setEnv, used, limit, remaining, percent, recordCall],
  )

  return <UsageEnvContext.Provider value={value}>{children}</UsageEnvContext.Provider>
}

export function useUsageEnv() {
  const ctx = useContext(UsageEnvContext)
  if (!ctx) throw new Error('useUsageEnv must be used within UsageEnvProvider')
  return ctx
}
