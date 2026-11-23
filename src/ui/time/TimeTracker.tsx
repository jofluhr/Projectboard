import { useMemo, useState } from 'react'
import { addDays, formatLongDate, toIsoDate } from '../../domain/dates'
import type { TimeEntry } from '../../domain/schema'
import {
  durationMinutes,
  entryKey,
  formatHours,
  nowClock,
  overlappingKeys,
  sumMinutes,
  targetOf,
  type Target,
} from '../../domain/time'
import { useStore } from '../../state/store'
import styles from './Time.module.css'
import { parseTargetValue, targetName, targetValue, withTarget } from './targets'

/** Day view: the blocks of one day, with a form to add more. Opens on today. */
export function TimeTracker() {
  const today = toIsoDate(new Date())
  const [date, setDate] = useState(today)
  const [editing, setEditing] = useState<string | null>(null)
  /** Bumped after each added entry, so the add form starts empty again. */
  const [added, setAdded] = useState(0)
  const allEntries = useStore((s) => s.timeEntries)
  const projects = useStore((s) => s.projects)
  const categories = useStore((s) => s.settings.timeCategories)
  const addTimeEntry = useStore((s) => s.addTimeEntry)
  const updateTimeEntry = useStore((s) => s.updateTimeEntry)
  const deleteTimeEntry = useStore((s) => s.deleteTimeEntry)

  const entries = useMemo(() => allEntries.filter((e) => e.date === date), [allEntries, date])
  const clashes = useMemo(() => overlappingKeys(entries), [entries])
  const lastEnd = entries.reduce((max, e) => (e.end > max ? e.end : max), '')

  const goTo = (next: string) => {
    if (!next) return
    setDate(next)
    setEditing(null)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Time tracker</h1>
        <div className={styles.dateBar}>
          <button type="button" className="btn btn-sm" aria-label="Previous day" onClick={() => goTo(addDays(date, -1))}>
            ‹
          </button>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            aria-label="Date"
            onChange={(e) => goTo(e.target.value)}
          />
          <button type="button" className="btn btn-sm" aria-label="Next day" onClick={() => goTo(addDays(date, 1))}>
            ›
          </button>
          <button type="button" className="btn btn-sm" disabled={date === today} onClick={() => goTo(today)}>
            Today
          </button>
        </div>
        <div className={styles.total}>
          <span>Total</span> <strong>{formatHours(sumMinutes(entries))}</strong>
        </div>
      </header>

      <section className={styles.card} aria-label={formatLongDate(date)}>
        <h2 className={styles.dayTitle}>{formatLongDate(date)}</h2>
        {entries.length === 0 && <p className={styles.emptyDay}>Nothing tracked on this day yet.</p>}
        <ul className={styles.entries}>
          {entries.map((e) => {
            const key = entryKey(e)
            return editing === key ? (
              <li key={key}>
                <EntryForm
                  date={date}
                  initial={e}
                  submitLabel="Save"
                  onSubmit={(entry) => {
                    const error = updateTimeEntry(key, entry)
                    if (!error) setEditing(null)
                    return error
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={key} className={`${styles.entry} ${clashes.has(key) ? styles.clash : ''}`}>
                <button
                  type="button"
                  className={styles.entryMain}
                  title="Edit"
                  onClick={() => setEditing(key)}
                >
                  <span className={`${styles.times} mono`}>
                    {e.start}–{e.end}
                  </span>
                  <span className={styles.target}>
                    <TargetBadge target={targetOf(e)} />
                    {targetName(targetOf(e), projects, categories)}
                  </span>
                  <span className={styles.note}>{e.note}</span>
                  <span className={styles.duration}>{formatHours(durationMinutes(e))}</span>
                </button>
                <button
                  type="button"
                  className={styles.delete}
                  aria-label={`Delete ${e.start}–${e.end}`}
                  title="Delete"
                  onClick={() => deleteTimeEntry(key)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        {clashes.size > 0 && (
          <p className={styles.clashHint} role="alert">
            Entries marked red overlap. Fix their times so they no longer overlap.
          </p>
        )}
        <div className={styles.addRow}>
          <EntryForm
            key={`${date}/${added}`}
            date={date}
            initial={null}
            defaultStart={lastEnd}
            submitLabel="Add"
            onSubmit={(entry) => {
              const error = addTimeEntry(entry)
              if (!error) setAdded((n) => n + 1)
              return error
            }}
          />
        </div>
      </section>
    </div>
  )
}

function TargetBadge({ target }: { target: Target }) {
  return <span className={styles.badge}>{target.kind === 'project' ? 'Project' : 'Category'}</span>
}

interface EntryFormProps {
  date: string
  initial: TimeEntry | null
  defaultStart?: string
  submitLabel: string
  /** Returns why the entry was refused, or null when it was saved. */
  onSubmit(entry: TimeEntry): string | null
  onCancel?(): void
}

function EntryForm({ date, initial, defaultStart = '', submitLabel, onSubmit, onCancel }: EntryFormProps) {
  const projects = useStore((s) => s.projects)
  const categories = useStore((s) => s.settings.timeCategories)
  const [start, setStart] = useState(initial?.start ?? defaultStart)
  const [end, setEnd] = useState(initial?.end ?? '')
  const [target, setTarget] = useState(initial ? targetValue(targetOf(initial)) : '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.archived)
  // An entry may point to an archived or deleted project or category; keep it selectable.
  const initialTarget = initial ? targetOf(initial) : null
  const listed =
    initialTarget &&
    (initialTarget.kind === 'project'
      ? activeProjects.some((p) => p.id === initialTarget.id)
      : categories.some((c) => c.id === initialTarget.id))

  const submit = () => {
    const parsed = parseTargetValue(target)
    if (!parsed) return setError('Choose a project or category.')
    const result = onSubmit(withTarget({ date, start, end, note: note.trim() }, parsed))
    setError(result)
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) onCancel()
      }}
    >
      <TimeField label="Start" value={start} onChange={setStart} autoFocus={initial !== null} />
      <TimeField label="End" value={end} onChange={setEnd} />
      <select
        className={styles.select}
        value={target}
        aria-label="Project or category"
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="" disabled>
          Project or category…
        </option>
        {initialTarget && !listed && (
          <option value={targetValue(initialTarget)}>{targetName(initialTarget, projects, categories)}</option>
        )}
        <optgroup label="Projects">
          {activeProjects.map((p) => (
            <option key={p.id} value={targetValue({ kind: 'project', id: p.id })}>
              {p.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Categories">
          {categories.map((c) => (
            <option key={c.id} value={targetValue({ kind: 'category', id: c.id })}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </select>
      <input
        className={styles.noteInput}
        value={note}
        placeholder="Note (optional)"
        aria-label="Note"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className={styles.formButtons}>
        <button type="submit" className="btn btn-primary btn-sm">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function TimeField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string
  value: string
  onChange(v: string): void
  autoFocus?: boolean
}) {
  return (
    <span className={styles.timeField}>
      <input
        type="time"
        className={styles.timeInput}
        value={value}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={styles.now}
        title={`Set ${label.toLowerCase()} to now`}
        onClick={() => onChange(nowClock(new Date()))}
      >
        now
      </button>
    </span>
  )
}
