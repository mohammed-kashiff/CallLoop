import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { API } from '../lib/api'
import type { PyaiStatus } from '../types'

interface PyaiStatusValue {
  status: PyaiStatus | null
  /** True when the configured PyAI key is sandbox / test. */
  isSandbox: boolean
  /** True when the configured PyAI key is live / production. */
  isLive: boolean
  /** Display label for both the ticker and sidebar meter. */
  label: string
}

const PyaiStatusContext = createContext<PyaiStatusValue | null>(null)

function deriveLabel(status: PyaiStatus | null): string {
  if (!status) return '…'
  const raw = (status.label || '').trim()
  if (raw) return raw
  if (status.env === 'test') return 'Sandbox'
  if (status.env === 'live') return 'Live'
  return 'PyAI'
}

function deriveSandbox(status: PyaiStatus | null, label: string): boolean {
  if (!status) return false
  if (status.env === 'test') return true
  if (status.env === 'live') return false
  return label.toLowerCase() === 'sandbox'
}

export function PyaiStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PyaiStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`${API}/api/pyai/status`)
        .then((r) => r.json() as Promise<PyaiStatus>)
        .then((data) => {
          if (!cancelled) setStatus(data)
        })
        .catch(() => {
          if (!cancelled) {
            setStatus({
              ok: false,
              healthy: false,
              label: 'PyAI',
              quota_label: 'Status unavailable',
            })
          }
        })
    }
    load()
    const id = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const value = useMemo(() => {
    const label = deriveLabel(status)
    const isSandbox = deriveSandbox(status, label)
    return {
      status,
      isSandbox,
      isLive: Boolean(status) && !isSandbox && label.toLowerCase() === 'live',
      label,
    }
  }, [status])

  return (
    <PyaiStatusContext.Provider value={value}>{children}</PyaiStatusContext.Provider>
  )
}

export function usePyaiStatus() {
  const ctx = useContext(PyaiStatusContext)
  if (!ctx) throw new Error('usePyaiStatus must be used within PyaiStatusProvider')
  return ctx
}
