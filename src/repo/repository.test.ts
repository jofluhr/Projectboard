import { beforeEach, describe, expect, it } from 'vitest'
import { addCard } from '../domain/ops'
import { MemoryStorage } from '../storage/memoryStorage'
import { INBOX_FILE, notesPath, projectPath, README_FILE, Repository, SETTINGS_FILE } from './repository'

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
