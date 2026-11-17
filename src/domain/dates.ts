/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parseIsoDate(s: string): Date {
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
