import { z } from 'zod'

/**
 * File format of the data folder. These schemas are the single source of truth:
 * the app validates every file it reads with them, and the JSON Schemas written
 * into the data folder (for Claude and other editors) are generated from them.
 */

export const SCHEMA_VERSION = 1

export const LABEL_COLORS = ['red', 'blue', 'purple', 'olive', 'amber', 'teal', 'gray'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')

export const PrioritySchema = z.enum(['high', 'medium', 'low'])

export const ChecklistItemSchema = z.object({
  text: z.string(),
  done: z.boolean().default(false),
})

export const CardSchema = z.object({
  /** Unique within the project. Shown as KEY-num, e.g. WEB-12. */
  num: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().default(''),
  priority: PrioritySchema.default('medium'),
  /** Label ids from settings.json. */
  labels: z.array(z.string()).default([]),
  due: isoDate.nullable().default(null),
  checklist: z.array(ChecklistItemSchema).default([]),
  createdAt: z.string().optional(),
  /** Set when the card enters a column that counts as done. */
  completedAt: z.string().nullable().default(null),
})

export const ColumnSchema = z.object({
  name: z.string().min(1),
  /** 0 means no limit. */
  wipLimit: z.number().int().min(0).default(0),
  /** Cards in this column count as finished. */
  done: z.boolean().default(false),
  cards: z.array(CardSchema).default([]),
})

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string().min(1),
    key: z.string().regex(/^[A-Z][A-Z0-9]{0,5}$/, 'Use 1-6 capital letters or digits, starting with a letter'),
    archived: z.boolean().default(false),
    /** Number the next new card gets. */
    nextNumber: z.number().int().positive().default(1),
    createdAt: z.string().optional(),
    columns: z.array(ColumnSchema).min(1),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<number>()
    p.columns.forEach((col, ci) =>
      col.cards.forEach((card, i) => {
        if (seen.has(card.num)) {
          ctx.addIssue({
            code: 'custom',
            message: `Card number ${card.num} is used more than once`,
            path: ['columns', ci, 'cards', i, 'num'],
          })
        }
        seen.add(card.num)
      }),
    )
  })

export const LabelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes'),
  name: z.string().min(1),
  color: z.enum(LABEL_COLORS),
})

/** Something to book time on that is not a project. */
export const TimeCategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes'),
  name: z.string().min(1),
})

const DEFAULT_TIME_CATEGORIES = [
  { id: 'training', name: 'Training' },
  { id: 'other', name: 'Other' },
]

export const SettingsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  labels: z.array(LabelSchema).default([]),
  timeCategories: z.array(TimeCategorySchema).default(() => DEFAULT_TIME_CATEGORIES.map((c) => ({ ...c }))),
})

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM')

/** One block of worked time on one day. Booked on either a project or a category. */
export const TimeEntrySchema = z
  .object({
    date: isoDate,
    start: clockTime,
    end: clockTime,
    /** Project id (folder name). */
    project: z.string().min(1).optional(),
    /** Category id from settings.json. */
    category: z.string().min(1).optional(),
    note: z.string().default(''),
  })
  .refine((e) => (e.project === undefined) !== (e.category === undefined), {
    message: 'Set either "project" or "category"',
  })
  .refine((e) => e.end > e.start, { message: 'The end must be after the start', path: ['end'] })

/** Contents of time/YYYY-MM.json. */
export const TimeMonthSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  entries: z.array(TimeEntrySchema).default([]),
})

export type Priority = z.infer<typeof PrioritySchema>
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>
export type Card = z.infer<typeof CardSchema>
export type Column = z.infer<typeof ColumnSchema>
export type Project = z.infer<typeof ProjectSchema>
export type Label = z.infer<typeof LabelSchema>
export type LabelColor = (typeof LABEL_COLORS)[number]
export type Settings = z.infer<typeof SettingsSchema>
export type TimeCategory = z.infer<typeof TimeCategorySchema>
export type TimeEntry = z.infer<typeof TimeEntrySchema>
export type TimeMonth = z.infer<typeof TimeMonthSchema>

/** A project as held in the app: its id is the file name without `.json`. */
export type LoadedProject = Project & { id: string }

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export function defaultSettings(): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    labels: [
      { id: 'bug', name: 'Bug', color: 'red' },
      { id: 'feature', name: 'Feature', color: 'blue' },
      { id: 'design', name: 'Design', color: 'purple' },
      { id: 'docs', name: 'Docs', color: 'olive' },
      { id: 'research', name: 'Research', color: 'amber' },
    ],
    timeCategories: DEFAULT_TIME_CATEGORIES.map((c) => ({ ...c })),
  }
}

/** Turns zod issues into one readable line per problem, e.g. "columns.0.name: Required". */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}
