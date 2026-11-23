import type { CardFilter } from '../../domain/filter'
import { PRIORITY_LABEL, type Priority } from '../../domain/schema'
import { useStore } from '../../state/store'
import styles from './Board.module.css'

export type ViewMode = 'board' | 'list'

interface Props {
  filter: CardFilter
  onFilter(filter: CardFilter): void
  view: ViewMode
  onView(view: ViewMode): void
}

export function BoardToolbar({ filter, onFilter, view, onView }: Props) {
  const labels = useStore((s) => s.settings.labels)

  return (
    <div className={styles.toolbar}>
      <input
        type="search"
        className={styles.search}
        placeholder="Search cards"
        aria-label="Search cards"
        value={filter.query}
        onChange={(e) => onFilter({ ...filter, query: e.target.value })}
      />
      <select
        className={styles.filterSelect}
        aria-label="Filter by label"
        value={filter.label}
        onChange={(e) => onFilter({ ...filter, label: e.target.value })}
      >
        <option value="">All labels</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select
        className={styles.filterSelect}
        aria-label="Filter by priority"
        value={filter.priority}
        onChange={(e) => onFilter({ ...filter, priority: e.target.value as Priority | '' })}
      >
        <option value="">Any priority</option>
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <div className={styles.seg} role="group" aria-label="View">
        {(['board', 'list'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}>
            {v === 'board' ? 'Board' : 'List'}
          </button>
        ))}
      </div>
    </div>
  )
}
