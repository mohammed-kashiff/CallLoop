import { TrainingCue } from '../components/LoopCues'
import { SketchWallpaper } from '../components/SketchWallpaper'

export function Training() {
  return (
    <>
      <header className="page-bar">
        <div>
          <p className="crumb">Loop / Practice</p>
          <h1>Training</h1>
        </div>
        <span className="topbar-chip">Coming soon</span>
      </header>

      <div className="empty-card is-pulse">
        <SketchWallpaper variant="training" />
        <TrainingCue />
        <p className="empty-title">Coming soon</p>
        <p className="empty-copy">
          Drills from coaching tips — listen, practice, recap. Not available yet.
        </p>
      </div>
    </>
  )
}
