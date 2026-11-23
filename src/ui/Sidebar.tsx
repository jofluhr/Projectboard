import { useState } from 'react'
import { projectStats } from '../domain/ops'
import { useStore } from '../state/store'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const projects = useStore((s) => s.projects)
  const whiteboards = useStore((s) => s.whiteboards)
  const active = useStore((s) => s.active)
  const invalid = useStore((s) => s.invalid)
  const warnings = useStore((s) => s.warnings)
  const folderName = useStore((s) => s.folderName)
  const setActive = useStore((s) => s.setActive)
  const pickFolder = useStore((s) => s.pickFolder)
  const createProject = useStore((s) => s.createProject)
  const createWhiteboard = useStore((s) => s.createWhiteboard)
  const [showArchived, setShowArchived] = useState(false)
  const today = new Date()

  const isActive = (kind: 'project' | 'whiteboard' | 'time', id: string) => active?.kind === kind && active.id === id
  const archivedBoards = whiteboards.filter((w) => w.archived)
  // An open archived board stays visible in the list even when the archive is collapsed.
  const boardsToShow = whiteboards.filter((w) => !w.archived || showArchived || isActive('whiteboard', w.name))

  return (
    <aside className={styles.side} aria-label="Navigation">
      <div className={styles.brand}>Projectboard</div>
      <div className={styles.scroll}>
        <div className={styles.sectionLabel}>Projects</div>
        <nav className={styles.list} aria-label="Projects">
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.project}
                aria-current={isActive('project', p.id)}
                onClick={() => setActive({ kind: 'project', id: p.id })}
              >
                <span className={`${styles.key} mono`}>{p.key}</span>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.count} title="Open cards">
                  {projectStats(p, today).open}
                </span>
              </button>
            ))}
        </nav>
        <NewItem label="+ New project" placeholder="Project name, then Enter" onCreate={createProject} />

        <div className={`${styles.sectionLabel} ${styles.secondSection}`}>Whiteboards</div>
        <nav className={styles.list} aria-label="Whiteboards">
          {boardsToShow.map((w) => (
            <button
              key={`${w.archived}/${w.name}`}
              type="button"
              className={`${styles.project} ${w.archived ? styles.archived : ''}`}
              aria-current={isActive('whiteboard', w.name)}
              onClick={() => setActive({ kind: 'whiteboard', id: w.name })}
            >
              <BoardIcon />
              <span className={styles.name}>{w.name}</span>
              {w.archived && <span className={styles.count}>archived</span>}
            </button>
          ))}
        </nav>
        <NewItem label="+ New whiteboard" placeholder="Whiteboard name, then Enter" onCreate={createWhiteboard} />
        {archivedBoards.length > 0 && (
          <button
            type="button"
            className={`${styles.linkBtn} ${styles.archiveToggle}`}
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : `Show archived (${archivedBoards.length})`}
          </button>
        )}

        <div className={`${styles.sectionLabel} ${styles.secondSection}`}>Time</div>
        <nav className={styles.list} aria-label="Time">
          <button
            type="button"
            className={styles.project}
            aria-current={isActive('time', 'tracker')}
            onClick={() => setActive({ kind: 'time', id: 'tracker' })}
          >
            <ClockIcon />
            <span className={styles.name}>Tracker</span>
          </button>
          <button
            type="button"
            className={styles.project}
            aria-current={isActive('time', 'overview')}
            onClick={() => setActive({ kind: 'time', id: 'overview' })}
          >
            <BarsIcon />
            <span className={styles.name}>Overview</span>
          </button>
        </nav>

        {warnings.length > 0 && (
          <div className={`${styles.invalid} ${styles.warning}`} role="status">
            <ul>
              {warnings.map((f) => (
                <li key={f.path}>
                  <span className="mono">{f.path}</span> {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}

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
      </div>

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

function BoardIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="5" height="4" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="4" rx="1" />
      <path d="M6.5 4.5h2.5a1.5 1.5 0 0 1 1.5 1.5v3.5" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  )
}

function BarsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 13.5h11M4.5 11V8M8 11V3.5M11.5 11V6" />
    </svg>
  )
}

function NewItem({ label, placeholder, onCreate }: { label: string; placeholder: string; onCreate: (name: string) => unknown }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const finish = (save: boolean) => {
    const trimmed = name.trim()
    setEditing(false)
    setName('')
    if (save && trimmed) void onCreate(trimmed)
  }

  if (!editing) {
    return (
      <button type="button" className={styles.newProject} onClick={() => setEditing(true)}>
        {label}
      </button>
    )
  }
  return (
    <input
      className={styles.newInput}
      autoFocus
      value={name}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
    />
  )
}
