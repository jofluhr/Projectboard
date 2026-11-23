import type { Card, Priority } from './schema'

/** What the board toolbar narrows the cards down to. Empty values match everything. */
export interface CardFilter {
  query: string
  label: string
  priority: Priority | ''
}

export const NO_FILTER: CardFilter = { query: '', label: '', priority: '' }

export function isFiltering(f: CardFilter): boolean {
  return Boolean(f.query.trim() || f.label || f.priority)
}

/** Search looks at the title, the description and the id (KEY-num), ignoring case. */
export function cardMatches(card: Card, projectKey: string, f: CardFilter): boolean {
  if (f.label && !card.labels.includes(f.label)) return false
  if (f.priority && card.priority !== f.priority) return false
  const q = f.query.trim().toLowerCase()
  if (!q) return true
  return [card.title, card.description, `${projectKey}-${card.num}`].some((s) => s.toLowerCase().includes(q))
}
