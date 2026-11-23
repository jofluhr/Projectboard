import type { z } from 'zod'
import { CanvasSchema, emptyCanvas, type LoadedWhiteboard } from '../domain/canvas'
import { newProject, normalizeProject } from '../domain/ops'
import { deriveKey, sameFileName, sanitizeFileName, uniqueSlug } from '../domain/naming'
import { monthKey, overlappingKeys, sortEntries } from '../domain/time'
import {
  defaultSettings,
  formatIssues,
  ProjectSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  TimeMonthSchema,
  type LoadedProject,
  type Settings,
  type TimeEntry,
} from '../domain/schema'
import type { Storage } from '../storage/types'

export const SETTINGS_FILE = 'settings.json'
export const INBOX_FILE = 'inbox.md'
export const README_FILE = 'README.md'
export const PROJECTS_DIR = 'projects'

/** Each project lives in its own folder, named by the project id. */
export const projectPath = (id: string) => `${PROJECTS_DIR}/${id}/${id}.json`
export const notesPath = (id: string) => `${PROJECTS_DIR}/${id}/Notes_${id}.md`
export const WHITEBOARDS_DIR = 'whiteboards'
export const ARCHIVED_WHITEBOARDS_DIR = `${WHITEBOARDS_DIR}/archived`
const CANVAS_EXT = '.canvas'
/** A whiteboard's file name is its name; archived boards live in a subfolder. */
export const whiteboardPath = (name: string, archived = false) =>
  `${archived ? ARCHIVED_WHITEBOARDS_DIR : WHITEBOARDS_DIR}/${name}${CANVAS_EXT}`
export const TIME_DIR = 'time'
/** Time entries are stored in one file per month, e.g. time/2026-11.json. */
export const timeMonthPath = (month: string) => `${TIME_DIR}/${month}.json`
const TIME_FILE = /^(\d{4}-\d{2})\.json$/
/** Where projects were stored before they got their own folders. */
const legacyProjectPath = (id: string) => `${PROJECTS_DIR}/${id}.json`

export interface InvalidFile {
  path: string
  message: string
}

export interface LoadResult {
  projects: LoadedProject[]
  settings: Settings
  invalid: InvalidFile[]
  /** Notes text per project id. Projects without a notes file are left out. */
  notes: Record<string, string>
  /** Number of project files moved from the old flat layout into project folders. */
  migrated: number
  /** Active and archived whiteboards, sorted by name. */
  whiteboards: LoadedWhiteboard[]
  /** Time entries of all months, sorted by date and start. */
  timeEntries: TimeEntry[]
  /** Files that were loaded but need attention (e.g. overlapping time entries). */
  warnings: InvalidFile[]
}

export type SaveResult = { ok: true } | { ok: false; reason: 'conflict' }

/** A file changed on disk since it was last read, so the app must reload before touching it. */
export class ConflictError extends Error {}

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/**
 * Reads and writes the data folder. Remembers the lastModified of every file it
 * has seen, so it can tell when the files were changed outside the app (e.g. by
 * Claude or a text editor). On a conflict the file on disk wins: saves are
 * refused and the caller reloads.
 */
export class Repository {
  private seen = new Map<string, number>()

  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get folderName(): string {
    return this.storage.name
  }

  async isInitialized(): Promise<boolean> {
    return (await this.storage.stat(SETTINGS_FILE)) !== null
  }

  /** Creates the starter files. Never overwrites existing files. */
  async initialize(): Promise<void> {
    const writeIfMissing = async (path: string, text: string) => {
      if ((await this.storage.stat(path)) === null) await this.storage.write(path, text)
    }
    await writeIfMissing(SETTINGS_FILE, toJson(defaultSettings()))
    await writeIfMissing(INBOX_FILE, '# Inbox\n\n')
    await writeIfMissing(README_FILE, DATA_README)
    if ((await this.projectIdsOnDisk()).length === 0) {
      await this.storage.write(projectPath('my-first-project'), toJson(newProject('My first project', 'MFP', this.now())))
    }
  }

  async loadAll(): Promise<LoadResult> {
    this.seen.clear()
    const invalid: InvalidFile[] = []
    const migrated = await this.migrateLegacyProjects(invalid)

    let settings = defaultSettings()
    const settingsFile = await this.storage.read(SETTINGS_FILE)
    if (settingsFile) {
      this.seen.set(SETTINGS_FILE, settingsFile.lastModified)
      const parsed = parseJson(settingsFile.text, SettingsSchema)
      if (parsed.ok) settings = parsed.value
      else invalid.push({ path: SETTINGS_FILE, message: parsed.message })
    }

    const projects: LoadedProject[] = []
    const notes: Record<string, string> = {}
    for (const id of (await this.storage.listDirs(PROJECTS_DIR)).sort()) {
      const path = projectPath(id)
      const content = await this.storage.read(path)
      if (!content) continue
      this.seen.set(path, content.lastModified)
      const parsed = parseJson(content.text, ProjectSchema)
      if (parsed.ok) projects.push({ ...normalizeProject(parsed.value), id })
      else invalid.push({ path, message: parsed.message })

      const notesFile = await this.storage.read(notesPath(id))
      if (notesFile) {
        this.seen.set(notesPath(id), notesFile.lastModified)
        notes[id] = notesFile.text
      }
    }
    projects.sort((a, b) => a.name.localeCompare(b.name))

    const whiteboards: LoadedWhiteboard[] = []
    for (const archived of [false, true]) {
      for (const name of await this.whiteboardNamesOnDisk(archived)) {
        const path = whiteboardPath(name, archived)
        const content = await this.storage.read(path)
        if (!content) continue
        this.seen.set(path, content.lastModified)
        // Obsidian writes an empty file for a new canvas.
        const parsed =
          content.text.trim() === '' ? { ok: true as const, value: emptyCanvas() } : parseJson(content.text, CanvasSchema)
        if (parsed.ok) whiteboards.push({ name, archived, canvas: parsed.value })
        else invalid.push({ path, message: parsed.message })
      }
    }
    whiteboards.sort((a, b) => a.name.localeCompare(b.name))

    const timeEntries: TimeEntry[] = []
    const warnings: InvalidFile[] = []
    for (const month of await this.timeMonthsOnDisk()) {
      const path = timeMonthPath(month)
      const content = await this.storage.read(path)
      if (!content) continue
      this.seen.set(path, content.lastModified)
      const parsed = parseJson(content.text, TimeMonthSchema)
      if (!parsed.ok) {
        invalid.push({ path, message: parsed.message })
        continue
      }
      const stray = parsed.value.entries.find((e) => monthKey(e.date) !== month)
      if (stray) {
        invalid.push({ path, message: `The entry on ${stray.date} belongs in ${timeMonthPath(monthKey(stray.date))}` })
        continue
      }
      timeEntries.push(...parsed.value.entries)
      if (overlappingKeys(parsed.value.entries).size > 0) warnings.push({ path, message: 'has overlapping entries' })
    }
    return { projects, settings, invalid, notes, migrated, whiteboards, timeEntries: sortEntries(timeEntries), warnings }
  }

  private async timeMonthsOnDisk(): Promise<string[]> {
    return (await this.storage.list(TIME_DIR))
      .map((f) => TIME_FILE.exec(f)?.[1])
      .filter((m): m is string => m !== undefined)
      .sort()
  }

  /**
   * Writes the entries of one month ("YYYY-MM") unless the file changed on disk.
   * Without entries the file is removed, so empty months leave no files behind.
   */
  async saveTimeMonth(month: string, entries: TimeEntry[]): Promise<SaveResult> {
    const path = timeMonthPath(month)
    if (entries.length > 0) {
      return this.saveFile(path, toJson({ schemaVersion: SCHEMA_VERSION, entries: sortEntries(entries) }))
    }
    const onDisk = await this.storage.stat(path)
    if (onDisk !== (this.seen.get(path) ?? null)) return { ok: false, reason: 'conflict' }
    if (onDisk !== null) await this.storage.remove(path)
    this.seen.delete(path)
    return { ok: true }
  }

  private async whiteboardNamesOnDisk(archived: boolean): Promise<string[]> {
    const dir = archived ? ARCHIVED_WHITEBOARDS_DIR : WHITEBOARDS_DIR
    return (await this.storage.list(dir)).filter((f) => f.endsWith(CANVAS_EXT)).map((f) => f.slice(0, -CANVAS_EXT.length))
  }

  /** Moves `projects/<id>.json` to `projects/<id>/<id>.json`. Never overwrites a file. */
  private async migrateLegacyProjects(invalid: InvalidFile[]): Promise<number> {
    let moved = 0
    for (const file of await this.legacyProjectFiles()) {
      const id = file.slice(0, -'.json'.length)
      const from = legacyProjectPath(id)
      if ((await this.storage.stat(projectPath(id))) !== null) {
        invalid.push({ path: from, message: `Not moved, because ${projectPath(id)} already exists` })
        continue
      }
      const content = await this.storage.read(from)
      if (!content) continue
      await this.storage.write(projectPath(id), content.text)
      await this.storage.remove(from)
      moved++
    }
    return moved
  }

  private async legacyProjectFiles(): Promise<string[]> {
    return (await this.storage.list(PROJECTS_DIR)).filter((f) => f.endsWith('.json'))
  }

  /** Ids of all project folders plus not yet migrated flat project files. */
  private async projectIdsOnDisk(): Promise<string[]> {
    const legacy = (await this.legacyProjectFiles()).map((f) => f.slice(0, -'.json'.length))
    return [...(await this.storage.listDirs(PROJECTS_DIR)), ...legacy]
  }

  /** Writes a project unless its file changed on disk since it was last read or written. */
  async saveProject(project: LoadedProject): Promise<SaveResult> {
    const { id: _id, ...data } = project
    return this.saveFile(projectPath(project.id), toJson(data))
  }

  /** Writes a project's notes (creating the file if needed) unless it changed on disk. */
  async saveNotes(id: string, text: string): Promise<SaveResult> {
    return this.saveFile(notesPath(id), text)
  }

  /** Writes a whiteboard unless its file changed on disk since it was last read or written. */
  async saveWhiteboard(board: LoadedWhiteboard): Promise<SaveResult> {
    return this.saveFile(whiteboardPath(board.name, board.archived), toJson(board.canvas))
  }

  /** Creates an empty whiteboard. Throws if the name is empty or already used. */
  async createWhiteboard(name: string): Promise<LoadedWhiteboard> {
    const fileName = await this.freeWhiteboardName(name, false)
    const board: LoadedWhiteboard = { name: fileName, archived: false, canvas: emptyCanvas() }
    const result = await this.saveWhiteboard(board)
    if (!result.ok) throw new Error(`A file named ${whiteboardPath(fileName)} appeared while creating the whiteboard`)
    return board
  }

  /** Renames the board's file. Throws if the new name is empty or used by another board. */
  async renameWhiteboard(board: LoadedWhiteboard, newName: string): Promise<LoadedWhiteboard> {
    const fileName = await this.freeWhiteboardName(newName, board.archived, board.name)
    if (fileName === board.name) return board
    await this.moveFile(whiteboardPath(board.name, board.archived), whiteboardPath(fileName, board.archived))
    return { ...board, name: fileName }
  }

  /** Moves the board into or out of the archive folder. */
  async setWhiteboardArchived(board: LoadedWhiteboard, archived: boolean): Promise<LoadedWhiteboard> {
    if (board.archived === archived) return board
    await this.freeWhiteboardName(board.name, archived)
    await this.moveFile(whiteboardPath(board.name, board.archived), whiteboardPath(board.name, archived))
    return { ...board, archived }
  }

  /** Deletes the board's file for good. */
  async deleteWhiteboard(board: LoadedWhiteboard): Promise<void> {
    const path = whiteboardPath(board.name, board.archived)
    this.assertUnchanged(path, await this.storage.stat(path))
    await this.storage.remove(path)
    this.seen.delete(path)
  }

  /**
   * Cleans up `name` for use as a file name and checks that no other board in the target
   * folder uses it (ignoring case, as Windows does). `ownName` is the board being renamed.
   */
  private async freeWhiteboardName(name: string, archived: boolean, ownName?: string): Promise<string> {
    const fileName = sanitizeFileName(name)
    if (!fileName) throw new Error('Please enter a name with at least one letter or digit.')
    const taken = (await this.whiteboardNamesOnDisk(archived)).filter((n) => n !== ownName)
    if (taken.some((n) => sameFileName(n, fileName))) {
      throw new Error(`There is already ${archived ? 'an archived' : 'a'} whiteboard named "${fileName}".`)
    }
    return fileName
  }

  /**
   * Moves a file by writing the new one and then removing the old one. Refuses if the
   * source changed on disk. A move that only changes upper/lower case goes through a
   * temporary name, because on Windows both names are the same file.
   */
  private async moveFile(from: string, to: string): Promise<void> {
    const content = await this.storage.read(from)
    this.assertUnchanged(from, content?.lastModified ?? null)
    if (!content) return
    if (sameFileName(from, to)) {
      const temp = `${to}.renaming`
      await this.storage.write(temp, content.text)
      await this.storage.remove(from)
      this.seen.set(to, await this.storage.write(to, content.text))
      await this.storage.remove(temp)
    } else {
      this.seen.set(to, await this.storage.write(to, content.text))
      await this.storage.remove(from)
    }
    this.seen.delete(from)
  }

  private assertUnchanged(path: string, onDisk: number | null) {
    if (onDisk !== (this.seen.get(path) ?? null)) {
      throw new ConflictError(`${path} was changed outside the app.`)
    }
  }

  private async saveFile(path: string, text: string): Promise<SaveResult> {
    const onDisk = await this.storage.stat(path)
    if (onDisk !== (this.seen.get(path) ?? null)) return { ok: false, reason: 'conflict' }
    this.seen.set(path, await this.storage.write(path, text))
    return { ok: true }
  }

  /** Creates a new project file with a unique id (file name) and key. */
  async createProject(name: string, existing: LoadedProject[]): Promise<LoadedProject> {
    const takenIds = [...existing.map((p) => p.id), ...(await this.projectIdsOnDisk())]
    const id = uniqueSlug(name, takenIds)
    const key = deriveKey(name, existing.map((p) => p.key))
    const project: LoadedProject = { ...newProject(name, key, this.now()), id }
    const result = await this.saveProject(project)
    if (!result.ok) throw new Error(`A file named ${projectPath(id)} appeared while creating the project`)
    return project
  }

  /** True if any known file changed or disappeared, or a new project or notes file appeared. */
  async hasExternalChanges(): Promise<boolean> {
    for (const [path, lastModified] of this.seen) {
      if ((await this.storage.stat(path)) !== lastModified) return true
    }
    const isNew = async (path: string) => !this.seen.has(path) && (await this.storage.stat(path)) !== null
    if (await isNew(SETTINGS_FILE)) return true
    if ((await this.legacyProjectFiles()).length > 0) return true
    for (const id of await this.storage.listDirs(PROJECTS_DIR)) {
      if ((await isNew(projectPath(id))) || (await isNew(notesPath(id)))) return true
    }
    for (const archived of [false, true]) {
      for (const name of await this.whiteboardNamesOnDisk(archived)) {
        if (await isNew(whiteboardPath(name, archived))) return true
      }
    }
    for (const month of await this.timeMonthsOnDisk()) {
      if (await isNew(timeMonthPath(month))) return true
    }
    return false
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

function parseJson<S extends z.ZodType>(text: string, schema: S): Parsed<z.output<S>> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, message: `Not valid JSON: ${(e as Error).message}` }
  }
  const result = schema.safeParse(raw)
  return result.success ? { ok: true, value: result.data } : { ok: false, message: formatIssues(result.error) }
}

const DATA_README = `# Projectboard data

This folder holds the data of Projectboard. All files are plain text and may be
edited by hand or by tools, also while the app is open. The app notices changes
when its window gets focus; if it was editing the same project at that moment,
the version on disk wins.

- \`settings.json\`: shared labels (id, name, color) and \`timeCategories\`
  (id, name): things to book time on that are not projects.
- \`inbox.md\`: ideas, one per line: \`- YYYY-MM-DD text\`.
- \`projects/<id>/\`: one folder per project. The folder name is the project id
  and never changes, even if the project is renamed.
  - \`<id>.json\`: the board. Columns are in board order; each column holds its
    cards in order.
  - \`Notes_<id>.md\`: free-form notes in Markdown. Created when notes are
    first written.
  Card numbers (\`num\`) must be unique within a project; \`nextNumber\` is the
  number the next new card gets.
- \`whiteboards/<name>.canvas\`: brainstorming boards in the open JSON Canvas
  format (jsoncanvas.org), so they also open in other canvas tools. The file
  name is the board name. Archived boards are in \`whiteboards/archived/\`.
- \`time/YYYY-MM.json\`: tracked time, one file per month. Each entry has
  \`date\` (YYYY-MM-DD, inside that month), \`start\` and \`end\` (HH:MM, end
  after start, same day), either \`project\` (project id) or \`category\`
  (id from \`timeCategories\`), and an optional \`note\`. Entries of one day
  must not overlap; touching is fine (10:00-12:00 and 12:00-14:00).

Tip: make this folder a local git repository to keep a history of every change.
`
