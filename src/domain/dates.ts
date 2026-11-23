/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Whole days from `today` to `iso`: negative = past, 0 = today. */
export function daysUntil(iso: string, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((parseIsoDate(iso).getTime() - start.getTime()) / 86_400_000)
}

export function formatShortDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The date `n` days after `iso` (negative goes back). */
export function addDays(iso: string, n: number): string {
  const d = parseIsoDate(iso)
  d.setDate(d.getDate() + n)
  return toIsoDate(d)
}

/** The Monday of the week that contains `iso`. */
export function startOfWeek(iso: string): string {
  const weekday = (parseIsoDate(iso).getDay() + 6) % 7 // Monday = 0
  return addDays(iso, -weekday)
}

/** Long form for headings, e.g. "Monday, November 23, 2026". */
export function formatLongDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
