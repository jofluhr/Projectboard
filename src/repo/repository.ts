import type { z } from 'zod'
import { newProject, normalizeProject } from '../domain/ops'
import { deriveKey, uniqueSlug } from '../domain/naming'
import {
  defaultSettings,
  formatIssues,
  ProjectSchema,
  SettingsSchema,
  type LoadedProject,
  type Settings,
} from '../domain/schema'
import type { Storage } from '../storage/types'

export const SETTINGS_FILE = 'settings.json'
export const INBOX_FILE = 'inbox.md'
export const README_FILE = 'README.md'
export const PROJECTS_DIR = 'projects'

export const projectPath = (id: string) => `${PROJECTS_DIR}/${id}.json`

export interface InvalidFile {
  path: string
  message: string
}

export interface LoadResult {
  projects: LoadedProject[]
  settings: Settings
  invalid: InvalidFile[]
}

export type SaveResult = { ok: true } | { ok: false; reason: 'conflict' }

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
    const existing = (await this.storage.list(PROJECTS_DIR)).filter((f) => f.endsWith('.json'))
    if (existing.length === 0) {
      await this.storage.write(projectPath('my-first-project'), toJson(newProject('My first project', 'MFP', this.now())))
    }
  }

  async loadAll(): Promise<LoadResult> {
    this.seen.clear()
    const invalid: InvalidFile[] = []

    let settings = defaultSettings()
    const settingsFile = await this.storage.read(SETTINGS_FILE)
    if (settingsFile) {
      this.seen.set(SETTINGS_FILE, settingsFile.lastModified)
      const parsed = parseJson(settingsFile.text, SettingsSchema)
      if (parsed.ok) settings = parsed.value
      else invalid.push({ path: SETTINGS_FILE, message: parsed.message })
    }

    const projects: LoadedProject[] = []
    const files = (await this.storage.list(PROJECTS_DIR)).filter((f) => f.endsWith('.json')).sort()
    for (const file of files) {
      const path = `${PROJECTS_DIR}/${file}`
      const content = await this.storage.read(path)
      if (!content) continue
      this.seen.set(path, content.lastModified)
      const parsed = parseJson(content.text, ProjectSchema)
      if (parsed.ok) projects.push({ ...normalizeProject(parsed.value), id: file.slice(0, -'.json'.length) })
      else invalid.push({ path, message: parsed.message })
    }
    projects.sort((a, b) => a.name.localeCompare(b.name))
    return { projects, settings, invalid }
  }

  /** Writes a project unless its file changed on disk since it was last read or written. */
  async saveProject(project: LoadedProject): Promise<SaveResult> {
    const path = projectPath(project.id)
    const onDisk = await this.storage.stat(path)
    if (onDisk !== (this.seen.get(path) ?? null)) return { ok: false, reason: 'conflict' }
    const { id: _id, ...data } = project
    this.seen.set(path, await this.storage.write(path, toJson(data)))
    return { ok: true }
  }

  /** Creates a new project file with a unique id (file name) and key. */
  async createProject(name: string, existing: LoadedProject[]): Promise<LoadedProject> {
    const takenIds = [...existing.map((p) => p.id), ...(await this.storage.list(PROJECTS_DIR)).map((f) => f.replace(/\.json$/, ''))]
    const id = uniqueSlug(name, takenIds)
    const key = deriveKey(name, existing.map((p) => p.key))
    const project: LoadedProject = { ...newProject(name, key, this.now()), id }
    const result = await this.saveProject(project)
    if (!result.ok) throw new Error(`A file named ${projectPath(id)} appeared while creating the project`)
    return project
  }

  /** True if any known file changed or disappeared, or a new project file appeared. */
  async hasExternalChanges(): Promise<boolean> {
    for (const [path, lastModified] of this.seen) {
      if ((await this.storage.stat(path)) !== lastModified) return true
    }
    if (!this.seen.has(SETTINGS_FILE) && (await this.storage.stat(SETTINGS_FILE)) !== null) return true
    const files = await this.storage.list(PROJECTS_DIR)
    return files.some((f) => f.endsWith('.json') && !this.seen.has(`${PROJECTS_DIR}/${f}`))
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

- \`settings.json\`: shared labels (id, name, color).
- \`inbox.md\`: ideas, one per line: \`- YYYY-MM-DD text\`.
- \`projects/<id>.json\`: one file per project. The file name is the project id.
  Columns are in board order; each column holds its cards in order.
  Card numbers (\`num\`) must be unique within a project; \`nextNumber\` is the
  number the next new card gets.

Tip: make this folder a local git repository to keep a history of every change.
`
