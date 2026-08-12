import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BrandLogo } from './BrandLogo'
import { Sidebar } from './Sidebar'

function themeFromPath(pathname: string): 'agents-pulse' | 'feedbacks' | 'churn-risk' {
  if (pathname.startsWith('/feedbacks')) return 'feedbacks'
  if (pathname.startsWith('/churn-risk')) return 'churn-risk'
  return 'agents-pulse'
}

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()
  const theme = themeFromPath(pathname)

  return (
    <div className="app-shell layout-shell" data-theme={theme}>
      <div className="atmosphere" aria-hidden="true" />

      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      <div className="content-shell">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-brand">
            <BrandLogo size="sm" surface="dark" showMark />
          </div>
          <div className="header-meta" aria-label="Session">
            <span className="meta-pill">Rubric v3.2</span>
            <span className="meta-pill soft">Sandbox ready</span>
          </div>
        </header>

        <main className="main">
          <div key={theme} className="page-theme-surface">
            <Outlet />
          </div>
        </main>

        <footer className="site-footer">
          <span>CALL LOOP — Not just a call auditing tool, we close the loop</span>
          <span>Listen · Analyze · Improve</span>
        </footer>
      </div>
    </div>
  )
}
