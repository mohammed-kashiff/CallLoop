import { NavLink } from 'react-router-dom'
import { BrandLogo } from './BrandLogo'

const NAV = [
  { to: '/', label: 'Agents Pulse', end: true },
  { to: '/feedbacks', label: 'Feedbacks', end: false },
  { to: '/churn-risk', label: 'Churn Risk', end: false },
] as const

interface SidebarProps {
  open: boolean
  onNavigate: () => void
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  return (
    <>
      <div
        className={['sidebar-backdrop', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        onClick={onNavigate}
        aria-hidden="true"
      />
      <aside
        className={['sidebar', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-label="Call Loop navigation"
      >
        <div className="sidebar-brand">
          <BrandLogo size="sm" surface="dark" />
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={onNavigate}
          >
            ✕
          </button>
        </div>

        <p className="sidebar-tagline">
          Not just a call auditing tool, we close the loop
        </p>
        <p className="sidebar-secondary">Listen · Analyze · Improve</p>

        <nav className="sidebar-nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ['sidebar-link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')
              }
              onClick={onNavigate}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="meta-pill ai-pill">AI Insights</span>
          <span className="meta-pill soft">Sandbox ready</span>
        </div>
      </aside>
    </>
  )
}
