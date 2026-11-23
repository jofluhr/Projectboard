import { useMemo, useState } from 'react'
import { formatShortDate, toIsoDate } from '../../domain/dates'
import { formatHours, rangeFor, targetKey, totalsByTarget, type DateRange, type RangePreset } from '../../domain/time'
import { useStore } from '../../state/store'
import styles from './Time.module.css'
import { targetName } from './targets'

const PRESETS: { id: RangePreset | 'custom'; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

/** Hours per project and category for a chosen range. */
export function TimeOverview() {
  const today = toIsoDate(new Date())
  const [preset, setPreset] = useState<RangePreset | 'custom'>('month')
  const [custom, setCustom] = useState(() => rangeFor('month', today) as { from: string; to: string })
  const entries = useStore((s) => s.timeEntries)
  const projects = useStore((s) => s.projects)
  const categories = useStore((s) => s.settings.timeCategories)

  const range: DateRange = preset === 'custom' ? custom : rangeFor(preset, today)
  const rows = useMemo(() => totalsByTarget(entries, range), [entries, range.from, range.to])
  const total = rows.reduce((s, r) => s + r.minutes, 0)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Time overview</h1>
        <div className={styles.presets} role="group" aria-label="Time range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.preset}
              aria-pressed={preset === p.id}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.rangeLine}>
          {preset === 'custom' ? (
            <>
              <input
                type="date"
                className={styles.dateInput}
                value={custom.from}
                max={custom.to}
                aria-label="From"
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
              />
              <span>to</span>
              <input
                type="date"
                className={styles.dateInput}
                value={custom.to}
                min={custom.from}
                aria-label="To"
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </>
          ) : (
            <span className={styles.rangeText}>
              {range.from && range.to ? `${formatShortDate(range.from)} – ${formatShortDate(range.to)}` : 'All tracked time'}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className={styles.emptyDay}>No time tracked in this range.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Project / category</th>
                <th scope="col" className={styles.barCol} aria-label="Share" />
                <th scope="col" className={styles.num}>
                  Hours
                </th>
                <th scope="col" className={styles.num}>
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={targetKey(r.target)}>
                  <td>
                    {targetName(r.target, projects, categories)}
                    {r.target.kind === 'category' && <span className={styles.badge}>Category</span>}
                  </td>
                  <td className={styles.barCol}>
                    <span className={styles.bar}>
                      <i style={{ width: `${r.share * 100}%` }} />
                    </span>
                  </td>
                  <td className={styles.num}>{formatHours(r.minutes)}</td>
                  <td className={styles.num}>{Math.round(r.share * 100)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className={styles.barCol} />
                <td className={styles.num}>{formatHours(total)}</td>
                <td className={styles.num}>100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  )
}
