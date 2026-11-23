import type { LoadedProject, TimeCategory, TimeEntry } from '../../domain/schema'
import { targetKey, type Target } from '../../domain/time'

/** Display name of a project or category; falls back to the id if it no longer exists. */
export function targetName(t: Target, projects: LoadedProject[], categories: TimeCategory[]): string {
  const found = t.kind === 'project' ? projects.find((p) => p.id === t.id) : categories.find((c) => c.id === t.id)
  return found?.name ?? t.id
}

/** Value of the project/category <select>, e.g. "project:website". */
export const targetValue = targetKey

export function parseTargetValue(value: string): Target | null {
  const colon = value.indexOf(':')
  const kind = value.slice(0, colon)
  const id = value.slice(colon + 1)
  if ((kind !== 'project' && kind !== 'category') || !id) return null
  return { kind, id }
}

/** Puts the target into an entry as `project` or `category`. */
export function withTarget(entry: Omit<TimeEntry, 'project' | 'category'>, t: Target): TimeEntry {
  return t.kind === 'project' ? { ...entry, project: t.id } : { ...entry, category: t.id }
}
