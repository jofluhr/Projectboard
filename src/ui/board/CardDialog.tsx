import { useEffect, useRef, useState } from 'react'
import { deleteCard, locateCard, moveCard, updateCard, type CardPatch } from '../../domain/ops'
import { PRIORITY_LABEL, type Card, type LoadedProject, type Priority, type Project } from '../../domain/schema'
import { useStore } from '../../state/store'
import styles from './CardDialog.module.css'

interface Props {
  project: LoadedProject
  num: number
  onClose(): void
}

/** Shows and edits one card. Every change is saved right away; text fields save when they lose focus. */
export function CardDialog({ project, num, onClose }: Props) {
  const at = locateCard(project, num)
  const card = at ? project.columns[at.col]!.cards[at.index]! : null

  // The card can disappear when the file is changed outside the app.
  useEffect(() => {
    if (!card) onClose()
  }, [card, onClose])

  return card && at ? <DialogBody project={project} card={card} col={at.col} onClose={onClose} /> : null
}

function DialogBody({ project, card, col, onClose }: { project: LoadedProject; card: Card; col: number; onClose(): void }) {
  const updateProject = useStore((s) => s.updateProject)
  const showToast = useStore((s) => s.showToast)
  const labels = useStore((s) => s.settings.labels)

  const ref = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [newItem, setNewItem] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const id = `${project.key}-${card.num}`
  const update = (change: (p: Project) => Project) => updateProject(project.id, change)
  const patch = (change: CardPatch) => update((p) => updateCard(p, card.num, change))

  const saveTitle = () => {
    const t = title.trim()
    if (!t) setTitle(card.title)
    else if (t !== card.title) patch({ title: t })
  }
  const saveDescription = () => {
    if (description !== card.description) patch({ description })
  }

  const addItem = () => {
    const text = newItem.trim()
    if (!text) return
    patch({ checklist: [...card.checklist, { text, done: false }] })
    setNewItem('')
  }

  const remove = () => {
    if (!deleteArmed) return setDeleteArmed(true)
    update((p) => deleteCard(p, card.num))
    showToast(`${id} deleted`)
  }

  const done = card.checklist.filter((i) => i.done).length
  const total = card.checklist.length

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={`Card ${id}`}
      onClose={() => {
        // Escape closes without a blur, so save open text edits here.
        saveTitle()
        saveDescription()
        onClose()
      }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <span className="mono">{id}</span>
          <span className={styles.muted}>in {project.name}</span>
          <button type="button" className={styles.close} aria-label="Close" onClick={() => ref.current?.close()}>
            ×
          </button>
        </div>

        <input
          className={styles.title}
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />

        <div className={styles.grid}>
          <label>
            Column
            <select
              value={col}
              onChange={(e) => update((p) => moveCard(p, card.num, Number(e.target.value), Infinity, new Date()))}
            >
              {project.columns.map((c, i) => (
                <option key={i} value={i}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={card.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={card.due ?? ''} onChange={(e) => patch({ due: e.target.value || null })} />
          </label>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>Labels</div>
          {labels.length ? (
            <div className={styles.labelPick}>
              {labels.map((l) => {
                const on = card.labels.includes(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`label-${l.color}`}
                    aria-pressed={on}
                    onClick={() => patch({ labels: on ? card.labels.filter((x) => x !== l.id) : [...card.labels, l.id] })}
                  >
                    {l.name}
                  </button>
                )
              })}
            </div>
          ) : (
            <span className={styles.muted}>No labels defined in settings.json.</span>
          )}
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="card-description">
            Description
          </label>
          <textarea
            id="card-description"
            rows={4}
            placeholder="Add details, links or notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>
            Checklist <span>{total ? `${done}/${total}` : ''}</span>
          </div>
          {total > 0 && (
            <div className={styles.bar}>
              <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
          )}
          <ul className={styles.checklist}>
            {card.checklist.map((item, i) => (
              <li key={i} className={item.done ? styles.itemDone : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) =>
                      patch({ checklist: card.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })
                    }
                  />
                  <span>{item.text}</span>
                </label>
                <button
                  type="button"
                  className={styles.removeItem}
                  aria-label={`Remove “${item.text}”`}
                  onClick={() => patch({ checklist: card.checklist.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.addItem}>
            <input
              placeholder="Add an item"
              aria-label="New checklist item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
            />
            <button type="button" className="btn" onClick={addItem}>
              Add
            </button>
          </div>
        </section>

        <div className={styles.foot}>
          <button
            type="button"
            className={`${styles.delete} ${deleteArmed ? styles.armed : ''}`}
            onClick={remove}
            onBlur={() => setDeleteArmed(false)}
          >
            {deleteArmed ? 'Click again to delete' : 'Delete card'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  )
}
