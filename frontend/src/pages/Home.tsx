import { BrandMotion } from '../components/BrandLogo'
import { ProblemSection } from '../components/ProblemSection'
import { useColorMode } from '../context/ColorMode'

export function Home() {
  const { mode } = useColorMode()

  return (
    <div className="home-stage">
      <ProblemSection />

      <div className="empty-card is-home">
        <BrandMotion size="hero" surface={mode === 'dark' ? 'dark' : 'light'} />
        <p className="empty-title">Ingest a call to close the loop</p>
        <p className="empty-copy">
          Score, coach, and capture churn from one recording — not a dashboard of dashboards.
        </p>
      </div>
    </div>
  )
}
