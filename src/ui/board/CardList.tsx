import { useState } from 'react'
import { cardMatches, isFiltering, type CardFilter } from '../../domain/filter'
import { PRIORITY_LABEL, type Card, type LoadedProject, type Priority } from '../../domain/schema'
import { useStore } from '../../state/store'
import styles from './Board.module.css'
import { dueInfo } from './CardTile'

type SortKey = 'id' | 'title' | 'status' | 'priority' | 'due'
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

interface Row {
  card: Card
  col: number
}

const sortValue: Record<SortKey, (r: Row) => number | string> = {
  id: (r) => r.card.num,
  title: (r) => r.card.title.toLowerCase(),
  status: (r) => r.col,
  priority: (r) => PRIORITY_RANK[r.card.priority],
  // Cards without a due date sort last.
  due: (r) => r.card.due ?? '9999-99-99',
}

interface Props {
  project: LoadedProject
  filter: CardFilter
  onOpen(num: number): void
}

export function CardList({ project, filter, onOpen }: Props) {
  const labels = useStore((s) => s.settings.labels)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 })

  const value = sortValue[sort.key]
  const rows: Row[] = project.columns
    .flatMap((column, col) => column.cards.map((card) => ({ card, col })))
    .filter((r) => cardMatches(r.card, project.key, filter))
    .sort((a, b) => {
      const x = value(a)
      const y = value(b)
      return (x < y ? -1 : x > y ? 1 : a.card.num - b.card.num) * sort.dir
    })

  const header = (key: SortKey, text: string) => (
    <th aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir > 0 ? -1 : 1 } : { key, dir: 1 }))}
      >
        {text}
      </button>
    </th>
  )

  return (
    <div className={styles.listWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {header('id', 'ID')}
            {header('title', 'Title')}
            {header('status', 'Status')}
            {header('priority', 'Priority')}
            <th>Labels</th>
            {header('due', 'Due')}
            <th>Checklist</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, col }) => {
            const column = project.columns[col]!
            const due = dueInfo(card, column.done)
            const checked = card.checklist.filter((i) => i.done).length
            return (
              <tr
                key={card.num}
                tabIndex={0}
                data-card-num={card.num}
                onClick={() => onOpen(card.num)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onOpen(card.num)
                  }
                }}
              >
                <td className={`${styles.num} mono`}>
                  {project.key}-{card.num}
                </td>
                <td className={column.done ? styles.rowTitleDone : styles.rowTitle}>{card.title}</td>
                <td>
                  <span className={styles.status}>{column.name}</span>
                </td>
                <td>
                  <span className={`${styles.priority} ${styles.priorityInline} ${styles[card.priority]}`}>
                    {PRIORITY_LABEL[card.priority]}
                  </span>
                </td>
                <td>
                  <div className={styles.labels}>
                    {card.labels.map((id) => {
                      const l = labels.find((x) => x.id === id)
                      return l ? (
                        <span key={id} className={`label label-${l.color}`}>
                          {l.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </td>
                <td className={styles.num}>
                  <span className={due?.tone ? styles[due.tone] : undefined}>{due ? due.text : '—'}</span>
                </td>
                <td className={styles.num}>{card.checklist.length ? `${checked}/${card.checklist.length}` : '—'}</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className={styles.noRows}>
                {isFiltering(filter) ? 'No cards match the filter.' : 'No cards yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
