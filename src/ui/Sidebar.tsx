import { useState } from 'react'
import { projectStats } from '../domain/ops'
import { useStore } from '../state/store'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const invalid = useStore((s) => s.invalid)
  const folderName = useStore((s) => s.folderName)
  const setActive = useStore((s) => s.setActive)
  const pickFolder = useStore((s) => s.pickFolder)
  const today = new Date()

  return (
    <aside className={styles.side} aria-label="Projects">
      <div className={styles.brand}>Projectboard</div>
      <div className={styles.sectionLabel}>Projects</div>
      <nav className={styles.list}>
        {projects
          .filter((p) => !p.archived)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.project}
              aria-current={p.id === activeId}
              onClick={() => setActive(p.id)}
            >
              <span className={`${styles.key} mono`}>{p.key}</span>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.count} title="Open cards">
                {projectStats(p, today).open}
              </span>
            </button>
          ))}
      </nav>
      <NewProject />

      {invalid.length > 0 && (
        <div className={styles.invalid} role="alert">
          <strong>
            {invalid.length === 1 ? '1 file could not be read' : `${invalid.length} files could not be read`}
          </strong>
          <ul>
            {invalid.map((f) => (
              <li key={f.path}>
                <span className="mono">{f.path}</span>: {f.message}
              </li>
            ))}
          </ul>
          <span>Fix the file and switch back to this window.</span>
        </div>
      )}

      <div className={styles.foot}>
        <span>
          Data folder: <strong>{folderName}</strong>
        </span>
        <button type="button" className={styles.linkBtn} onClick={() => void pickFolder()}>
          Change folder
        </button>
      </div>
    </aside>
  )
}

function NewProject() {
  const createProject = useStore((s) => s.createProject)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const finish = (save: boolean) => {
    const trimmed = name.trim()
    setEditing(false)
    setName('')
    if (save && trimmed) void createProject(trimmed)
  }

  if (!editing) {
    return (
      <button type="button" className={styles.newProject} onClick={() => setEditing(true)}>
        + New project
      </button>
    )
  }
  return (
    <input
      className={styles.newInput}
      autoFocus
      value={name}
      placeholder="Project name, then Enter"
      aria-label="New project name"
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
    />
  )
}
