import { beforeEach, describe, expect, it } from 'vitest'
import { addCard } from '../domain/ops'
import { MemoryStorage } from '../storage/memoryStorage'
import { ConflictError, INBOX_FILE, notesPath, projectPath, README_FILE, Repository, SETTINGS_FILE, whiteboardPath } from './repository'
import { addCard as addCanvasCard } from '../domain/canvasOps'

const NOW = new Date('2026-03-10T09:00:00Z')

let storage: MemoryStorage
let repo: Repository

beforeEach(async () => {
  storage = new MemoryStorage()
  repo = new Repository(storage, () => NOW)
})

describe('initialize', () => {
  it('creates the starter files in an empty folder', async () => {
    expect(await repo.isInitialized()).toBe(false)
    await repo.initialize()
    expect(await repo.isInitialized()).toBe(true)
    for (const f of [SETTINGS_FILE, INBOX_FILE, README_FILE, projectPath('my-first-project')]) {
      expect(storage.files.has(f)).toBe(true)
    }
    const { projects, invalid } = await repo.loadAll()
    expect(invalid).toEqual([])
    expect(projects.map((p) => p.name)).toEqual(['My first project'])
  })

  it('never overwrites existing files', async () => {
    await storage.write(INBOX_FILE, '- 2026-03-01 keep me\n')
    await storage.write(projectPath('existing'), '{}')
    await repo.initialize()
    expect(storage.files.get(INBOX_FILE)!.text).toBe('- 2026-03-01 keep me\n')
    expect(storage.files.has(projectPath('my-first-project'))).toBe(false)
  })
})

describe('load and save', () => {
  beforeEach(() => repo.initialize())

  it('round-trips a project through the file', async () => {
    const [p] = (await repo.loadAll()).projects
    const changed = { ...addCard(p!, 0, 'Write tests', NOW), id: p!.id }
    expect(await repo.saveProject(changed)).toEqual({ ok: true })

    const fresh = new Repository(storage, () => NOW)
    const [reloaded] = (await fresh.loadAll()).projects
    expect(reloaded).toEqual(changed)
  })

  it('writes readable, stable JSON without the id', async () => {
    const [p] = (await repo.loadAll()).projects
    await repo.saveProject(p!)
    const text = storage.files.get(projectPath(p!.id))!.text
    expect(text).toContain('\n  "name": "My first project"')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).not.toHaveProperty('id')
  })

  it('fills defaults for fields a hand-written file leaves out', async () => {
    await storage.write(
      projectPath('minimal'),
      JSON.stringify({ schemaVersion: 1, name: 'Minimal', key: 'MIN', columns: [{ name: 'Todo', cards: [{ num: 7, title: 'Hello' }] }] }),
    )
    const p = (await repo.loadAll()).projects.find((x) => x.id === 'minimal')!
    expect(p.nextNumber).toBe(8)
    expect(p.columns[0]!.cards[0]).toMatchObject({ priority: 'medium', labels: [], due: null, checklist: [] })
  })

  it('reports invalid files and still loads the others', async () => {
    await storage.write(projectPath('broken'), '{ not json')
    await storage.write(projectPath('wrong'), JSON.stringify({ schemaVersion: 1, name: 'Wrong', key: 'lower', columns: [] }))
    const { projects, invalid } = await repo.loadAll()
    expect(projects).toHaveLength(1)
    expect(invalid.map((i) => i.path).sort()).toEqual([projectPath('broken'), projectPath('wrong')])
    expect(invalid.find((i) => i.path === projectPath('wrong'))!.message).toMatch(/key/)
  })

  it('rejects duplicate card numbers', async () => {
    await storage.write(
      projectPath('dupes'),
      JSON.stringify({ schemaVersion: 1, name: 'Dupes', key: 'DUP', columns: [{ name: 'A', cards: [{ num: 1, title: 'a' }, { num: 1, title: 'b' }] }] }),
    )
    const { invalid } = await repo.loadAll()
    expect(invalid[0]!.message).toMatch(/more than once/)
  })
})

describe('conflicts with external edits', () => {
  beforeEach(() => repo.initialize())

  it('detects no changes right after loading', async () => {
    await repo.loadAll()
    expect(await repo.hasExternalChanges()).toBe(false)
  })

  it('detects an edited, a new and a deleted project file', async () => {
    const [p] = (await repo.loadAll()).projects
    const path = projectPath(p!.id)

    await storage.write(path, storage.files.get(path)!.text)
    expect(await repo.hasExternalChanges()).toBe(true)

    await repo.loadAll()
    await storage.write(projectPath('new'), '{}')
    expect(await repo.hasExternalChanges()).toBe(true)

    await repo.loadAll()
    await storage.remove(path)
    expect(await repo.hasExternalChanges()).toBe(true)
  })

  it('does not count its own saves as external changes', async () => {
    const [p] = (await repo.loadAll()).projects
    await repo.saveProject({ ...addCard(p!, 0, 'Mine', NOW), id: p!.id })
    expect(await repo.hasExternalChanges()).toBe(false)
  })

  it('refuses to overwrite a file that changed on disk, so the disk wins', async () => {
    const [p] = (await repo.loadAll()).projects
    const path = projectPath(p!.id)
    await storage.write(path, storage.files.get(path)!.text.replace('My first project', 'Edited elsewhere'))

    expect(await repo.saveProject({ ...addCard(p!, 0, 'Mine', NOW), id: p!.id })).toEqual({ ok: false, reason: 'conflict' })
    expect(storage.files.get(path)!.text).toContain('Edited elsewhere')

    const [reloaded] = (await repo.loadAll()).projects
    expect(reloaded!.name).toBe('Edited elsewhere')
    expect(await repo.saveProject(reloaded!)).toEqual({ ok: true })
  })
})

describe('createProject', () => {
  it('picks a unique id and key', async () => {
    await repo.initialize()
    const { projects } = await repo.loadAll()
    const a = await repo.createProject('Website', projects)
    const b = await repo.createProject('Website', [...projects, a])
    expect([a.id, a.key]).toEqual(['website', 'WEB'])
    expect([b.id, b.key]).toEqual(['website-2', 'WEB2'])
    expect((await repo.loadAll()).projects).toHaveLength(3)
  })
})

describe('project folders', () => {
  it('keeps each project in its own folder named by the id', async () => {
    await repo.initialize()
    const a = await repo.createProject('Website', (await repo.loadAll()).projects)
    expect(projectPath(a.id)).toBe('projects/website/website.json')
    expect(storage.files.has('projects/website/website.json')).toBe(true)
  })

  it('moves flat project files from the old layout into folders', async () => {
    await repo.initialize()
    const text = storage.files.get(projectPath('my-first-project'))!.text
    await storage.remove(projectPath('my-first-project'))
    await storage.write('projects/old.json', text)

    expect(await repo.hasExternalChanges()).toBe(true)
    const { projects, migrated, invalid } = await repo.loadAll()
    expect(migrated).toBe(1)
    expect(invalid).toEqual([])
    expect(projects.map((p) => p.id)).toEqual(['old'])
    expect(storage.files.has('projects/old.json')).toBe(false)
    expect(storage.files.get(projectPath('old'))!.text).toBe(text)
    expect((await repo.loadAll()).migrated).toBe(0)
  })

  it('never overwrites a project folder while migrating', async () => {
    await repo.initialize()
    await storage.write('projects/my-first-project.json', '{}')
    const { migrated, invalid } = await repo.loadAll()
    expect(migrated).toBe(0)
    expect(invalid.map((i) => i.path)).toEqual(['projects/my-first-project.json'])
    expect(storage.files.has('projects/my-first-project.json')).toBe(true)
  })
})

describe('notes', () => {
  beforeEach(() => repo.initialize())

  it('creates the notes file on the first save and reads it back', async () => {
    const { projects, notes } = await repo.loadAll()
    const id = projects[0]!.id
    expect(notes).toEqual({})
    expect(storage.files.has(notesPath(id))).toBe(false)

    expect(await repo.saveNotes(id, '# Goals\n')).toEqual({ ok: true })
    expect(notesPath(id)).toBe(`projects/${id}/Notes_${id}.md`)
    expect(storage.files.get(notesPath(id))!.text).toBe('# Goals\n')
    expect(await repo.hasExternalChanges()).toBe(false)

    const fresh = new Repository(storage, () => NOW)
    expect((await fresh.loadAll()).notes).toEqual({ [id]: '# Goals\n' })
  })

  it('keeps an emptied notes file', async () => {
    const id = (await repo.loadAll()).projects[0]!.id
    await repo.saveNotes(id, 'text')
    await repo.saveNotes(id, '')
    expect(storage.files.get(notesPath(id))!.text).toBe('')
  })

  it('detects new and edited notes files and lets the disk win', async () => {
    const id = (await repo.loadAll()).projects[0]!.id

    await storage.write(notesPath(id), 'written elsewhere')
    expect(await repo.hasExternalChanges()).toBe(true)
    expect(await repo.saveNotes(id, 'mine')).toEqual({ ok: false, reason: 'conflict' })

    expect((await repo.loadAll()).notes[id]).toBe('written elsewhere')
    expect(await repo.hasExternalChanges()).toBe(false)

    await storage.write(notesPath(id), 'edited again')
    expect(await repo.hasExternalChanges()).toBe(true)
    expect(await repo.saveNotes(id, 'mine')).toEqual({ ok: false, reason: 'conflict' })
    expect(storage.files.get(notesPath(id))!.text).toBe('edited again')
  })
})

describe('whiteboards', () => {
  beforeEach(() => repo.initialize())

  it('creates, loads and saves a board as a JSON Canvas file named after the board', async () => {
    const board = await repo.createWhiteboard('App architecture')
    expect(board).toEqual({ name: 'App architecture', archived: false, canvas: { nodes: [], edges: [] } })
    expect(JSON.parse(storage.files.get(whiteboardPath('App architecture'))!.text)).toEqual({ nodes: [], edges: [] })

    const canvas = addCanvasCard(board.canvas, { x: 0, y: 0 }, 'Hello', 'n1').canvas
    expect(await repo.saveWhiteboard({ ...board, canvas })).toEqual({ ok: true })

    const { whiteboards, invalid } = await new Repository(storage).loadAll()
    expect(invalid).toEqual([])
    expect(whiteboards).toEqual([{ name: 'App architecture', archived: false, canvas }])
  })

  it('loads empty files (as other tools write them) and reports broken ones', async () => {
    await storage.write(whiteboardPath('Empty'), '')
    await storage.write(whiteboardPath('Broken'), '{"nodes": [{"id": "x"}]}')
    const { whiteboards, invalid } = await repo.loadAll()
    expect(whiteboards.map((w) => w.name)).toEqual(['Empty'])
    expect(invalid.map((f) => f.path)).toEqual([whiteboardPath('Broken')])
  })

  it('refuses empty and taken names, ignoring case', async () => {
    await repo.createWhiteboard('Ideas')
    await expect(repo.createWhiteboard(' ?? ')).rejects.toThrow(/at least one letter/)
    await expect(repo.createWhiteboard('IDEAS')).rejects.toThrow(/already a whiteboard named "IDEAS"/)
  })

  it('renames the file, also when only the case changes', async () => {
    await repo.loadAll()
    const board = await repo.createWhiteboard('Ideas')
    await repo.createWhiteboard('Other')
    await expect(repo.renameWhiteboard(board, 'other')).rejects.toThrow(/already/)

    const renamed = await repo.renameWhiteboard(board, 'Ideas: round 2')
    expect(renamed.name).toBe('Ideas round 2')
    expect(storage.files.has(whiteboardPath('Ideas'))).toBe(false)
    expect(storage.files.has(whiteboardPath('Ideas round 2'))).toBe(true)

    const recased = await repo.renameWhiteboard(renamed, 'IDEAS ROUND 2')
    expect(recased.name).toBe('IDEAS ROUND 2')
    expect([...storage.files.keys()].filter((p) => p.startsWith('whiteboards/'))).toEqual([
      whiteboardPath('Other'),
      whiteboardPath('IDEAS ROUND 2'),
    ])
    // Saving after a rename writes the new file without a conflict.
    expect(await repo.saveWhiteboard(recased)).toEqual({ ok: true })
    expect(await repo.hasExternalChanges()).toBe(false)
  })

  it('archives into a subfolder, restores and deletes', async () => {
    const board = await repo.createWhiteboard('Old ideas')
    const archived = await repo.setWhiteboardArchived(board, true)
    expect(storage.files.has(whiteboardPath('Old ideas', true))).toBe(true)
    expect(storage.files.has(whiteboardPath('Old ideas'))).toBe(false)
    expect((await new Repository(storage).loadAll()).whiteboards).toEqual([archived])

    // A new board may reuse the name; restoring the old one is then refused.
    const again = await repo.createWhiteboard('Old ideas')
    await expect(repo.setWhiteboardArchived(archived, false)).rejects.toThrow(/already a whiteboard/)
    await repo.deleteWhiteboard(again)
    const restored = await repo.setWhiteboardArchived(archived, false)
    expect(restored.archived).toBe(false)

    await repo.deleteWhiteboard(restored)
    expect([...storage.files.keys()].some((p) => p.startsWith('whiteboards/'))).toBe(false)
  })

  it('refuses to save, move or delete a board changed outside the app', async () => {
    const board = await repo.createWhiteboard('Shared')
    await storage.write(whiteboardPath('Shared'), '{"nodes": [], "edges": []}\n')
    expect(await repo.hasExternalChanges()).toBe(true)
    expect(await repo.saveWhiteboard(board)).toEqual({ ok: false, reason: 'conflict' })
    await expect(repo.renameWhiteboard(board, 'Renamed')).rejects.toBeInstanceOf(ConflictError)
    await expect(repo.setWhiteboardArchived(board, true)).rejects.toBeInstanceOf(ConflictError)
    await expect(repo.deleteWhiteboard(board)).rejects.toBeInstanceOf(ConflictError)
    expect(storage.files.has(whiteboardPath('Shared'))).toBe(true)
  })

  it('notices new board files', async () => {
    await repo.loadAll()
    expect(await repo.hasExternalChanges()).toBe(false)
    await storage.write(whiteboardPath('From elsewhere', true), '{}')
    expect(await repo.hasExternalChanges()).toBe(true)
  })
})
