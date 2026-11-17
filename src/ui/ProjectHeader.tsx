import { projectStats } from '../domain/ops'
import type { LoadedProject } from '../domain/schema'
import styles from './ProjectHeader.module.css'

export function ProjectHeader({ project }: { project: LoadedProject }) {
  const stats = projectStats(project, new Date())
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0

  return (
    <header className={styles.header}>
      <h1>{project.name}</h1>
      <div className={styles.stats}>
        {stats.overdue > 0 && <span className={styles.overdue}>{stats.overdue} overdue</span>}
        <span>
          {stats.done} of {stats.total} done
        </span>
        <span className={styles.meter} role="img" aria-label={`${pct}% done`}>
          <i style={{ width: `${pct}%` }} />
        </span>
        <span>{pct}%</span>
      </div>
    </header>
  )
}
