import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../state/store'
import styles from './NotesPanel.module.css'
import { renderMarkdown } from './renderMarkdown'

const SAVE_DELAY_MS = 1000

interface Props {
  projectId: string
  open: boolean
  onToggle(): void
}

/** Toggle row plus the unrolled notes of one project (rendered Markdown or the raw text). */
export function NotesPanel({ projectId, open, onToggle }: Props) {
  const stored = useStore((s) => s.notes[projectId] ?? '')
  const [editing, setEditing] = useState(false)
  const hasNotes = stored.trim() !== ''

  return (
    <section className={styles.notes}>
      <button
        type="button"
        className={`btn btn-sm ${styles.toggle}`}
        aria-expanded={open}
        aria-controls="project-notes"
        onClick={onToggle}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Notes
        {hasNotes && !open && <span className={styles.dot} title="This project has notes" />}
      </button>

      {open && (
        <div id="project-notes" className={styles.panel}>
          {editing ? (
            <NotesEditor projectId={projectId} stored={stored} onDone={() => setEditing(false)} />
          ) : (
            <NotesView text={stored} onEdit={() => setEditing(true)} />
          )}
        </div>
      )}
    </section>
  )
}

function NotesView({ text, onEdit }: { text: string; onEdit(): void }) {
  const html = useMemo(() => renderMarkdown(text), [text])

  if (text.trim() === '') {
    return (
      <div className={styles.empty}>
        No notes yet.{' '}
        <button type="button" className={styles.link} onClick={onEdit}>
          Edit
        </button>
      </div>
    )
  }
  return (
    <>
      <div className={styles.bar}>
        <button type="button" className="btn btn-sm" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}

function NotesEditor({ projectId, stored, onDone }: { projectId: string; stored: string; onDone(): void }) {
  const [draft, setDraft] = useState(stored)
  const draftRef = useRef(stored)
  /** The text this editor last handed to the store. */
  const savedRef = useRef(stored)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (draftRef.current === savedRef.current) return
    savedRef.current = draftRef.current
    useStore.getState().saveNotes(projectId, draftRef.current)
  }

  // The notes were reloaded from disk (changed outside the app): the disk wins.
  useEffect(() => {
    if (stored === savedRef.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    savedRef.current = stored
    draftRef.current = stored
    setDraft(stored)
  }, [stored])

  // Save what is left when the editor closes or the project changes.
  useEffect(() => flush, [])

  const change = (text: string) => {
    setDraft(text)
    draftRef.current = text
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  const done = () => {
    flush()
    onDone()
  }

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.hint}>Markdown · saved automatically · Esc to finish</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={done}>
          Done
        </button>
      </div>
      <textarea
        className={styles.editor}
        value={draft}
        autoFocus
        spellCheck
        aria-label="Project notes (Markdown)"
        placeholder="# Goals&#10;&#10;- Write notes in Markdown"
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            done()
          }
        }}
      />
    </>
  )
}
