import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type FocusEvent } from 'react'
import { isOverWip } from '../../domain/ops'
import type { Card, Column, Label } from '../../domain/schema'
import styles from './Board.module.css'
import { CardTile } from './CardTile'
import { cardDndId, columnDndId } from './dndIds'

interface Props {
  index: number
  column: Column
  nums: number[]
  cards: Map<number, Card>
  projectKey: string
  labels: Label[]
  editing: boolean
  onEdit(editing: boolean): void
  onSave(patch: { name: string; wipLimit: number }): void
  onAddCard(title: string): void
}

export function BoardColumn({ index, column, nums, cards, projectKey, labels, editing, onEdit, onSave, onAddCard }: Props) {
  const { setNodeRef } = useDroppable({ id: columnDndId(index) })
  const over = isOverWip(column, nums.length)

  return (
    <section className={`${styles.column} ${over ? styles.over : ''}`} aria-label={column.name}>
      {editing ? (
        <ColumnEditor column={column} onDone={(patch) => (patch && onSave(patch), onEdit(false))} />
      ) : (
        <header className={styles.columnHead}>
          <button type="button" className={styles.columnName} title="Rename column or set WIP limit" onClick={() => onEdit(true)}>
            {column.name}
          </button>
          <span className={`${styles.count} mono`} title={column.wipLimit ? 'Cards / WIP limit' : 'Cards'}>
            {nums.length}
            {column.wipLimit ? `/${column.wipLimit}` : ''}
          </span>
          {column.done && (
            <span className={styles.doneTag} title="Cards in this column count as done">
              done
            </span>
          )}
          {over && <span className={styles.wipFlag}>Over limit</span>}
        </header>
      )}

      <SortableContext items={nums.map(cardDndId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={styles.cards}>
          {nums.map((num) => {
            const card = cards.get(num)
            return card ? <SortableCard key={num} card={card} projectKey={projectKey} labels={labels} done={column.done} /> : null
          })}
          {nums.length === 0 && <div className={styles.empty}>Drop cards here</div>}
        </div>
      </SortableContext>

      <Composer onAdd={onAddCard} />
    </section>
  )
}

function SortableCard(props: { card: Card; projectKey: string; labels: Label[]; done: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardDndId(props.card.num) })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? styles.placeholder : undefined}
      {...attributes}
      {...listeners}
    >
      <CardTile {...props} />
    </div>
  )
}

function ColumnEditor({ column, onDone }: { column: Column; onDone(patch: { name: string; wipLimit: number } | null): void }) {
  const [name, setName] = useState(column.name)
  const [wip, setWip] = useState(String(column.wipLimit))
  const save = () => onDone({ name: name.trim() || column.name, wipLimit: Math.max(0, Math.min(99, parseInt(wip, 10) || 0)) })

  // Save when focus leaves both inputs.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) save()
  }

  return (
    <div
      className={styles.columnHead}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') onDone(null)
      }}
    >
      <input
        className={styles.headInput}
        aria-label="Column name"
        value={name}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.target.value)}
      />
      <label className={styles.wipLabel}>
        WIP
        <input
          className={styles.headInput}
          aria-label="WIP limit, 0 for none"
          title="WIP limit (0 = no limit)"
          type="number"
          min={0}
          max={99}
          value={wip}
          onChange={(e) => setWip(e.target.value)}
        />
      </label>
    </div>
  )
}

function Composer({ onAdd }: { onAdd(title: string): void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const commit = (keepOpen: boolean) => {
    const title = text.trim()
    if (title) onAdd(title)
    setText('')
    setOpen(keepOpen && Boolean(title))
  }

  if (!open) {
    return (
      <div className={styles.addSlot}>
        <button type="button" className={styles.addCard} onClick={() => setOpen(true)}>
          + Add card
        </button>
      </div>
    )
  }
  return (
    <div className={styles.addSlot}>
      <textarea
        className={styles.composer}
        rows={2}
        autoFocus
        value={text}
        placeholder="What needs doing?"
        aria-label="New card title"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commit(true)
          } else if (e.key === 'Escape') {
            setText('')
            setOpen(false)
          }
        }}
        onBlur={() => commit(false)}
      />
      <div className={styles.composerRow}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          // Keep focus in the textarea so the blur handler does not run first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit(true)}
        >
          Add card
        </button>
        <span className={styles.hint}>Enter adds · Esc cancels</span>
      </div>
    </div>
  )
}
