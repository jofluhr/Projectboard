import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import styles from './App.module.css'
import { Board } from './board/Board'
import { NotesPanel } from './notes/NotesPanel'
import { ProjectHeader } from './ProjectHeader'
import { Sidebar } from './Sidebar'
import { Toast } from './Toast'
import { Welcome } from './Welcome'

export function App() {
  const ready = useStore((s) => s.status.kind === 'ready')

  useEffect(() => {
    void useStore.getState().boot()
  }, [])

  // Files may be edited outside the app (e.g. by Claude). Check when the window comes back.
  useEffect(() => {
    const check = () => void useStore.getState().checkExternalChanges()
    const onVisible = () => document.visibilityState === 'visible' && check()
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
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null)
  // Kept across project switches, closed again on every app start.
  const [notesOpen, setNotesOpen] = useState(false)
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        {project ? (
          <>
            <ProjectHeader project={project} />
            <NotesPanel key={project.id} projectId={project.id} open={notesOpen} onToggle={() => setNotesOpen((o) => !o)} />
            <div className={styles.view}>
              <Board key={project.id} project={project} />
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
