import { addDays, startOfWeek } from './dates'
import type { TimeEntry } from './schema'

/**
 * Time tracking rules. Times are "HH:MM" strings on one calendar day; a block covers
 * [start, end), so 10:00–12:00 and 12:00–14:00 touch but do not overlap.
 */

/** Identifies an entry: entries on one day never overlap, so no two share a start. */
export const entryKey = (e: Pick<TimeEntry, 'date' | 'start'>) => `${e.date} ${e.start}`

/** What an entry is booked on. */
export type Target = { kind: 'project' | 'category'; id: string }

export function targetOf(e: TimeEntry): Target {
  return e.project !== undefined ? { kind: 'project', id: e.project } : { kind: 'category', id: e.category ?? '' }
}

export const targetKey = (t: Target) => `${t.kind}:${t.id}`

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function durationMinutes(e: Pick<TimeEntry, 'start' | 'end'>): number {
  return Math.max(0, toMinutes(e.end) - toMinutes(e.start))
}

export function sumMinutes(entries: TimeEntry[]): number {
  return entries.reduce((sum, e) => sum + durationMinutes(e), 0)
}

/** Decimal hours with at most two decimals, e.g. 405 → "6.75 h", 90 → "1.5 h". */
export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 100) / 100} h`
}

/** The current local time as "HH:MM". */
export function nowClock(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const overlaps = (a: TimeEntry, b: TimeEntry) => a.date === b.date && a.start < b.end && b.start < a.end

/** The first entry `candidate` overlaps, ignoring the entry with key `ignore` (the one being edited). */
export function findOverlap(entries: TimeEntry[], candidate: TimeEntry, ignore?: string): TimeEntry | undefined {
  return entries.find((e) => entryKey(e) !== ignore && overlaps(e, candidate))
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** Why `candidate` can't be saved, or null if it can. `ignore` is the key of the entry being edited. */
export function validateEntry(entries: TimeEntry[], candidate: TimeEntry, ignore?: string): string | null {
  if (!CLOCK.test(candidate.start) || !CLOCK.test(candidate.end)) return 'Enter a start and an end time.'
  if (candidate.end <= candidate.start) return 'The end must be after the start (split blocks that run past midnight).'
  if (!candidate.project && !candidate.category) return 'Choose a project or category.'
  const clash = findOverlap(entries, candidate, ignore)
  if (clash) return `Overlaps the entry ${clash.start}–${clash.end}.`
  return null
}

/** Keys of all entries that overlap another one (only possible in files edited by hand). */
export function overlappingKeys(entries: TimeEntry[]): Set<string> {
  const keys = new Set<string>()
  const sorted = sortEntries(entries)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!
      const b = sorted[j]!
      if (b.date !== a.date || b.start >= a.end) break
      keys.add(entryKey(a))
      keys.add(entryKey(b))
    }
  }
  return keys
}

/** "2026-11-23" → "2026-11", the month file the entry lives in. */
export const monthKey = (date: string) => date.slice(0, 7)

export function sortEntries(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}

export type RangePreset = 'week' | 'month' | 'last-month' | 'all'

/** Inclusive date range; null means open-ended. */
export interface DateRange {
  from: string | null
  to: string | null
}

export function rangeFor(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case 'week': {
      const from = startOfWeek(today)
      return { from, to: addDays(from, 6) }
    }
    case 'month': {
      const first = `${monthKey(today)}-01`
      return { from: first, to: lastDayOfMonth(first) }
    }
    case 'last-month': {
      const first = `${monthKey(addDays(`${monthKey(today)}-01`, -1))}-01`
      return { from: first, to: lastDayOfMonth(first) }
    }
    case 'all':
      return { from: null, to: null }
  }
}

function lastDayOfMonth(first: string): string {
  // Day 28 plus 4 days is always in the next month.
  return addDays(`${monthKey(addDays(`${monthKey(first)}-28`, 4))}-01`, -1)
}

export const inRange = (date: string, r: DateRange) => (r.from === null || date >= r.from) && (r.to === null || date <= r.to)

export interface TargetTotal {
  target: Target
  minutes: number
  /** Part of the total, 0–1. */
  share: number
}

/** Minutes per project/category within `range`, largest first; targets without time are left out. */
export function totalsByTarget(entries: TimeEntry[], range: DateRange): TargetTotal[] {
  const byKey = new Map<string, { target: Target; minutes: number }>()
  for (const e of entries) {
    if (!inRange(e.date, range)) continue
    const target = targetOf(e)
    const row = byKey.get(targetKey(target)) ?? { target, minutes: 0 }
    row.minutes += durationMinutes(e)
    byKey.set(targetKey(target), row)
  }
  const rows = [...byKey.values()].filter((r) => r.minutes > 0)
  const total = rows.reduce((s, r) => s + r.minutes, 0)
  return rows
    .map((r) => ({ ...r, share: total ? r.minutes / total : 0 }))
    .sort((a, b) => b.minutes - a.minutes || targetKey(a.target).localeCompare(targetKey(b.target)))
}
