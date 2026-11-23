import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import styles from './App.module.css'
import { ProjectView } from './board/ProjectView'
import { NotesPanel } from './notes/NotesPanel'
import { ProjectHeader } from './ProjectHeader'
import { Sidebar } from './Sidebar'
import { Toast } from './Toast'
import { TimeOverview } from './time/TimeOverview'
import { TimeTracker } from './time/TimeTracker'
import { Welcome } from './Welcome'
import { WhiteboardView } from './whiteboard/WhiteboardView'

export function App() {
  const ready = useStore((s) => s.status.kind === 'ready')

  useEffect(() => {
    void useStore.getState().boot()
  }, [])

  // Files may be edited outside the app (e.g. by Claude). Check when the window comes back.
  useEffect(() => {
    const check = () => void useStore.getState().checkExternalChanges()
    // Whiteboards save with a short delay; write pending changes before the tab is hidden or closed.
    const onVisible = () =>
      document.visibilityState === 'visible' ? check() : useStore.getState().flushWhiteboards()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <>
      {ready ? <Workspace /> : <Welcome />}
      <Toast />
    </>
  )
}

function Workspace() {
  const project = useStore((s) =>
    s.active?.kind === 'project' ? (s.projects.find((p) => p.id === s.active!.id) ?? null) : null,
  )
  const whiteboard = useStore((s) =>
    s.active?.kind === 'whiteboard' ? (s.whiteboards.find((w) => w.name === s.active!.id) ?? null) : null,
  )
  const timeView = useStore((s) => (s.active?.kind === 'time' ? s.active.id : null))
  // Changes on every sidebar click, so the Tracker opens on today each time it is picked.
  const navCount = useStore((s) => s.navCount)
  // Kept across project switches, closed again on every app start.
  const [notesOpen, setNotesOpen] = useState(false)
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        {timeView === 'tracker' ? (
          <TimeTracker key={navCount} />
        ) : timeView === 'overview' ? (
          <TimeOverview />
        ) : whiteboard ? (
          <WhiteboardView key={`${whiteboard.archived}/${whiteboard.name}`} board={whiteboard} />
        ) : project ? (
          <>
            <ProjectHeader project={project} />
            <NotesPanel key={project.id} projectId={project.id} open={notesOpen} onToggle={() => setNotesOpen((o) => !o)} />
            <div className={styles.view}>
              <ProjectView key={project.id} project={project} />
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <h1>No projects yet</h1>
            <p>Create one with “New project” in the sidebar.</p>
          </div>
        )}
      </main>
    </div>
  )
}
