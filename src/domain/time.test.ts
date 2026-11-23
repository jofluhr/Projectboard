import { describe, expect, it } from 'vitest'
import { addDays, startOfWeek } from './dates'
import type { TimeEntry } from './schema'
import {
  durationMinutes,
  entryKey,
  findOverlap,
  formatHours,
  overlappingKeys,
  rangeFor,
  sortEntries,
  totalsByTarget,
  validateEntry,
} from './time'

const DAY = '2026-03-10'
const e = (start: string, end: string, over: Partial<TimeEntry> = {}): TimeEntry => ({
  date: DAY,
  start,
  end,
  project: 'example',
  note: '',
  ...over,
})

describe('durations', () => {
  it('counts minutes between start and end', () => {
    expect(durationMinutes(e('09:15', '11:30'))).toBe(135)
  })

  it('formats decimal hours with at most two decimals', () => {
    expect(formatHours(405)).toBe('6.75 h')
    expect(formatHours(90)).toBe('1.5 h')
    expect(formatHours(120)).toBe('2 h')
    expect(formatHours(10)).toBe('0.17 h')
    expect(formatHours(0)).toBe('0 h')
  })
})

describe('overlaps', () => {
  const existing = [e('10:00', '12:00')]

  it('lets blocks touch', () => {
    expect(findOverlap(existing, e('12:00', '14:00'))).toBeUndefined()
    expect(findOverlap(existing, e('08:00', '10:00'))).toBeUndefined()
  })

  it('refuses a one-minute overlap', () => {
    expect(findOverlap(existing, e('11:59', '14:00'))).toBe(existing[0])
  })

  it('refuses a block inside or around another one', () => {
    expect(findOverlap(existing, e('10:30', '11:00'))).toBeDefined()
    expect(findOverlap(existing, e('09:00', '13:00'))).toBeDefined()
  })

  it('ignores other days and the entry being edited', () => {
    expect(findOverlap(existing, e('10:00', '12:00', { date: '2026-03-11' }))).toBeUndefined()
    expect(findOverlap(existing, e('10:30', '12:30'), entryKey(existing[0]!))).toBeUndefined()
  })

  it('finds all overlapping entries in a hand-edited day', () => {
    const keys = overlappingKeys([e('13:00', '14:00'), e('10:00', '12:00'), e('11:00', '11:30'), e('12:00', '13:00')])
    expect([...keys].sort()).toEqual([`${DAY} 10:00`, `${DAY} 11:00`])
  })
})

describe('validateEntry', () => {
  it('accepts a valid entry', () => {
    expect(validateEntry([], e('09:00', '10:00'))).toBeNull()
  })

  it('needs both times, in order', () => {
    expect(validateEntry([], e('', '10:00'))).toMatch(/start and an end/)
    expect(validateEntry([], e('10:00', '10:00'))).toMatch(/after the start/)
    expect(validateEntry([], e('22:00', '01:00'))).toMatch(/after the start/)
  })

  it('needs a project or category', () => {
    expect(validateEntry([], e('09:00', '10:00', { project: undefined }))).toMatch(/project or category/)
    expect(validateEntry([], e('09:00', '10:00', { project: undefined, category: 'other' }))).toBeNull()
  })

  it('names the clashing entry', () => {
    expect(validateEntry([e('10:00', '12:00')], e('11:59', '14:00'))).toBe('Overlaps the entry 10:00–12:00.')
  })
})

describe('date ranges', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-03-10')).toBe('2026-03-09') // Tuesday
    expect(startOfWeek('2026-03-09')).toBe('2026-03-09') // Monday
    expect(startOfWeek('2026-03-15')).toBe('2026-03-09') // Sunday
    expect(rangeFor('week', '2026-03-15')).toEqual({ from: '2026-03-09', to: '2026-03-15' })
  })

  it('covers whole months, also across the year border', () => {
    expect(rangeFor('month', '2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeFor('month', '2028-02-14')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(rangeFor('last-month', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(rangeFor('all', DAY)).toEqual({ from: null, to: null })
  })

  it('adds days across month borders', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('totalsByTarget', () => {
  const entries = [
    e('09:00', '10:00', { project: 'alpha' }),
    e('10:00', '12:00', { project: 'beta' }),
    e('12:00', '13:00', { project: undefined, category: 'other' }),
    e('09:00', '10:00', { project: 'alpha', date: '2026-04-01' }),
  ]

  it('sums per target within the range, largest first', () => {
    const rows = totalsByTarget(entries, { from: '2026-03-01', to: '2026-03-31' })
    expect(rows.map((r) => [r.target.kind, r.target.id, r.minutes])).toEqual([
      ['project', 'beta', 120],
      ['category', 'other', 60],
      ['project', 'alpha', 60],
    ])
    expect(rows[0]!.share).toBeCloseTo(0.5)
  })

  it('counts everything for an open range', () => {
    const rows = totalsByTarget(entries, { from: null, to: null })
    expect(rows.find((r) => r.target.id === 'alpha')!.minutes).toBe(120)
  })
})

it('sorts by date, then start', () => {
  const sorted = sortEntries([e('12:00', '13:00'), e('09:00', '10:00', { date: '2026-03-09' }), e('08:00', '09:00')])
  expect(sorted.map(entryKey)).toEqual(['2026-03-09 09:00', `${DAY} 08:00`, `${DAY} 12:00`])
})
