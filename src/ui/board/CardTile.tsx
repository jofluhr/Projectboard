import { daysUntil, formatShortDate } from '../../domain/dates'
import { PRIORITY_LABEL, type Card, type Label } from '../../domain/schema'
import styles from './Board.module.css'

interface Props {
  card: Card
  projectKey: string
  labels: Label[]
  /** The card sits in a column that counts as done. */
  done: boolean
  /** Rendered in the drag overlay. */
  lifted?: boolean
}

export function dueInfo(card: Card, done: boolean, today = new Date()): { text: string; tone: 'overdue' | 'soon' | null } | null {
  if (!card.due) return null
  if (done) return { text: formatShortDate(card.due), tone: null }
  const days = daysUntil(card.due, today)
  if (days < 0) return { text: `Overdue · ${formatShortDate(card.due)}`, tone: 'overdue' }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' }
  return { text: formatShortDate(card.due), tone: null }
}

export function CardTile({ card, projectKey, labels, done, lifted }: Props) {
  const due = dueInfo(card, done)
  const checked = card.checklist.filter((i) => i.done).length
  const total = card.checklist.length
  const cardLabels = card.labels.map((id) => labels.find((l) => l.id === id)).filter((l): l is Label => Boolean(l))

  return (
    <article className={`${styles.card} ${done ? styles.cardDone : ''} ${lifted ? styles.lifted : ''}`}>
      <div className={styles.cardTop}>
        <span className={`${styles.cardId} mono`}>
          {projectKey}-{card.num}
        </span>
        <span className={`${styles.priority} ${styles[card.priority]}`}>{PRIORITY_LABEL[card.priority]}</span>
      </div>
      <h3 className={styles.cardTitle}>{card.title}</h3>
      {cardLabels.length > 0 && (
        <div className={styles.labels}>
          {cardLabels.map((l) => (
            <span key={l.id} className={`label label-${l.color}`}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      {(due || total > 0 || card.description) && (
        <div className={styles.meta}>
          {due && <span className={due.tone ? styles[due.tone] : undefined}>{due.text}</span>}
          {total > 0 && (
            <span className={checked === total ? styles.complete : undefined}>
              ✓ {checked}/{total}
            </span>
          )}
          {card.description && <span title="Has a description">≡</span>}
        </div>
      )}
    </article>
  )
}
