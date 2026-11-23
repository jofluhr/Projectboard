import { daysUntil } from './dates'
import { SCHEMA_VERSION, type Card, type Column, type Project } from './schema'

/**
 * Pure operations on a project. Each returns a new project and never mutates
 * its input, so the store can apply them optimistically and save the result.
 */

export function newProject(name: string, key: string, now: Date): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    key,
    archived: false,
    nextNumber: 1,
    createdAt: now.toISOString(),
    columns: [
      { name: 'To Do', wipLimit: 0, done: false, cards: [] },
      { name: 'In Progress', wipLimit: 3, done: false, cards: [] },
      { name: 'Done', wipLimit: 0, done: true, cards: [] },
    ],
  }
}

/** Repairs values a hand edit may have left inconsistent. */
export function normalizeProject(p: Project): Project {
  const maxNum = Math.max(0, ...p.columns.flatMap((c) => c.cards.map((card) => card.num)))
  return p.nextNumber > maxNum ? p : { ...p, nextNumber: maxNum + 1 }
}

export function addCard(p: Project, colIndex: number, title: string, now: Date): Project {
  const col = p.columns[colIndex]
  if (!col) return p
  const card: Card = {
    num: p.nextNumber,
    title,
    description: '',
    priority: 'medium',
    labels: [],
    due: null,
    checklist: [],
    createdAt: now.toISOString(),
    completedAt: col.done ? now.toISOString() : null,
  }
  return {
    ...p,
    nextNumber: p.nextNumber + 1,
    columns: p.columns.map((c, i) => (i === colIndex ? { ...c, cards: [...c.cards, card] } : c)),
  }
}

export function locateCard(p: Project, num: number): { col: number; index: number } | null {
  for (let col = 0; col < p.columns.length; col++) {
    const index = p.columns[col]!.cards.findIndex((c) => c.num === num)
    if (index >= 0) return { col, index }
  }
  return null
}

/**
 * Moves a card to `toCol` at `toIndex`, where `toIndex` is the position in the
 * target column after the card has been taken out of its old place.
 */
export function moveCard(p: Project, num: number, toCol: number, toIndex: number, now: Date): Project {
  const from = locateCard(p, num)
  if (!from || !p.columns[toCol]) return p
  const columns = p.columns.map((c) => ({ ...c, cards: [...c.cards] }))
  const [card] = columns[from.col]!.cards.splice(from.index, 1)
  const target = columns[toCol]!
  const wasDone = p.columns[from.col]!.done
  let completedAt = card!.completedAt
  if (!target.done) completedAt = null
  else if (!wasDone || !completedAt) completedAt = now.toISOString()
  const index = Math.max(0, Math.min(toIndex, target.cards.length))
  target.cards.splice(index, 0, { ...card!, completedAt })
  return { ...p, columns }
}

export type CardPatch = Partial<Pick<Card, 'title' | 'description' | 'priority' | 'labels' | 'due' | 'checklist'>>

export function updateCard(p: Project, num: number, patch: CardPatch): Project {
  if (!locateCard(p, num)) return p
  return {
    ...p,
    columns: p.columns.map((c) => ({ ...c, cards: c.cards.map((card) => (card.num === num ? { ...card, ...patch } : card)) })),
  }
}

export function deleteCard(p: Project, num: number): Project {
  const at = locateCard(p, num)
  if (!at) return p
  return { ...p, columns: p.columns.map((c, i) => (i === at.col ? { ...c, cards: c.cards.filter((card) => card.num !== num) } : c)) }
}

export function updateColumn(p: Project, colIndex: number, patch: Partial<Pick<Column, 'name' | 'wipLimit'>>): Project {
  return { ...p, columns: p.columns.map((c, i) => (i === colIndex ? { ...c, ...patch } : c)) }
}

/** Adds an empty column in front of the first "done" column, or at the end. */
export function addColumn(p: Project, name: string): { project: Project; index: number } {
  const firstDone = p.columns.findIndex((c) => c.done)
  const index = firstDone < 0 ? p.columns.length : firstDone
  const columns = [...p.columns]
  columns.splice(index, 0, { name, wipLimit: 0, done: false, cards: [] })
  return { project: { ...p, columns }, index }
}

export function isOverWip(col: Pick<Column, 'wipLimit'>, count: number): boolean {
  return col.wipLimit > 0 && count > col.wipLimit
}

export interface ProjectStats {
  total: number
  done: number
  open: number
  overdue: number
}

export function projectStats(p: Project, today: Date): ProjectStats {
  let total = 0
  let done = 0
  let overdue = 0
  for (const col of p.columns) {
    for (const card of col.cards) {
      total++
      if (col.done) done++
      else if (card.due && daysUntil(card.due, today) < 0) overdue++
    }
  }
  return { total, done, open: total - done, overdue }
}
