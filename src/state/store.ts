import { create } from 'zustand'
import type { Canvas, LoadedWhiteboard } from '../domain/canvas'
import { sameFileName } from '../domain/naming'
import { defaultSettings, type LoadedProject, type Project, type Settings } from '../domain/schema'
import { ConflictError, Repository, type InvalidFile } from '../repo/repository'
import { FsAccessStorage } from '../storage/fsAccessStorage'
import { isFolderAccessSupported, loadFolderHandle, saveFolderHandle } from '../storage/folderHandle'

export type Status =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'no-folder' }
  | { kind: 'needs-permission'; folderName: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

interface Toast {
  id: number
  text: string
}

/** What the main area shows: a project (by id) or a whiteboard (by name). */
export type Active = { kind: 'project'; id: string } | { kind: 'whiteboard'; id: string }

interface AppState {
  status: Status
  folderName: string
  projects: LoadedProject[]
  settings: Settings
  invalid: InvalidFile[]
  /** Notes text per project id; missing means the project has no notes file yet. */
  notes: Record<string, string>
  /** Active and archived whiteboards, sorted by name. */
  whiteboards: LoadedWhiteboard[]
  active: Active | null
  toast: Toast | null

  boot(): Promise<void>
  pickFolder(): Promise<void>
  grantPermission(): Promise<void>
  checkExternalChanges(): Promise<void>
  setActive(active: Active): void
  createProject(name: string): Promise<void>
  /** Applies `change` right away and saves the project in the background. */
  updateProject(id: string, change: (p: Project) => Project): void
  /** Sets the notes right away and saves them in the background. */
  saveNotes(id: string, text: string): void
  createWhiteboard(name: string): Promise<void>
  /** Sets the board's content right away and saves it shortly after the last change. */
  setWhiteboardCanvas(name: string, canvas: Canvas): void
  /** Saves pending whiteboard changes now instead of after the delay. */
  flushWhiteboards(): void
  /** Resolves to false if the rename was refused (the reason is shown as a toast). */
  renameWhiteboard(name: string, newName: string): Promise<boolean>
  setWhiteboardArchived(name: string, archived: boolean): Promise<void>
  deleteWhiteboard(name: string): Promise<void>
  showToast(text: string): void
}

/** Whiteboards are saved this long after the last change, so a burst of edits is one write. */
const WHITEBOARD_SAVE_DELAY_MS = 500

let repo: Repository | null = null
let pendingHandle: FileSystemDirectoryHandle | null = null
let booted = false
/** Saves run one after another so writes never overlap. */
let saveQueue: Promise<void> = Promise.resolve()
/** Pending delayed whiteboard saves, by board name. */
const whiteboardTimers = new Map<string, ReturnType<typeof setTimeout>>()

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export const useStore = create<AppState>()((set, get) => {
  async function open(handle: FileSystemDirectoryHandle) {
    set({ status: { kind: 'loading' } })
    try {
      repo = new Repository(new FsAccessStorage(handle))
      if (!(await repo.isInitialized())) await repo.initialize()
      await reload()
      set({ status: { kind: 'ready' }, folderName: repo.folderName })
    } catch (e) {
      repo = null
      set({ status: { kind: 'error', message: errorMessage(e) } })
    }
  }

  async function reload(notice?: string) {
    if (!repo) return
    for (const timer of whiteboardTimers.values()) clearTimeout(timer)
    whiteboardTimers.clear()
    const { projects, settings, invalid, notes, migrated, whiteboards } = await repo.loadAll()
    const visible = projects.filter((p) => !p.archived)
    const current = get().active
    const stillThere =
      current?.kind === 'project'
        ? visible.some((p) => p.id === current.id)
        : current?.kind === 'whiteboard' && whiteboards.some((w) => w.name === current.id)
    const fallback = visible[0] ? { kind: 'project' as const, id: visible[0].id } : null
    set({ projects, settings, invalid, notes, whiteboards, active: stillThere ? current : fallback })
    if (migrated > 0) notice = `Moved ${migrated} project file${migrated === 1 ? '' : 's'} into project folders.`
    if (notice) get().showToast(notice)
  }

  function findWhiteboard(name: string): LoadedWhiteboard | undefined {
    return get().whiteboards.find((w) => w.name === name)
  }

  /** Replaces (or with null removes) a board in the state and follows it with the selection. */
  function replaceWhiteboard(name: string, next: LoadedWhiteboard | null) {
    set((s) => {
      const rest = s.whiteboards.filter((w) => w.name !== name)
      const whiteboards = (next ? [...rest, next] : rest).sort((a, b) => a.name.localeCompare(b.name))
      let active = s.active
      if (active?.kind === 'whiteboard' && active.id === name) {
        const firstProject = s.projects.find((p) => !p.archived)
        active = next
          ? { kind: 'whiteboard', id: next.name }
          : firstProject
            ? { kind: 'project', id: firstProject.id }
            : null
      }
      return { whiteboards, active }
    })
  }

  /**
   * After a board's file was moved (renamed or (un)archived): updates the state, keeping
   * edits made while the move ran, and saves those edits to the new file.
   */
  function afterMove(oldName: string, moved: LoadedWhiteboard, before: LoadedWhiteboard) {
    const latest = findWhiteboard(oldName) ?? before
    clearTimeout(whiteboardTimers.get(oldName))
    whiteboardTimers.delete(oldName)
    replaceWhiteboard(oldName, { ...latest, name: moved.name, archived: moved.archived })
    if (latest.canvas !== before.canvas) queueWhiteboardSave(moved.name)
  }

  /** Queues a save of the board as it is in the state when the save runs. */
  function queueWhiteboardSave(name: string) {
    saveQueue = saveQueue.then(async () => {
      const latest = findWhiteboard(name)
      if (!repo || !latest) return
      try {
        const result = await repo.saveWhiteboard(latest)
        if (!result.ok) await reload(`"${name}" was changed outside the app. Reloaded from disk; your last change was not saved.`)
      } catch (e) {
        get().showToast(`Could not save "${name}": ${errorMessage(e)}`)
      }
    })
  }

  /** Runs a whiteboard file operation after all pending saves. Errors become toasts. */
  function runWhiteboardOp<T>(what: string, op: (repo: Repository) => Promise<T>): Promise<T | undefined> {
    get().flushWhiteboards()
    const result = saveQueue.then(async () => {
      if (!repo) return undefined
      try {
        return await op(repo)
      } catch (e) {
        if (e instanceof ConflictError) await reload(`${errorMessage(e)} Reloaded from disk.`)
        else get().showToast(`Could not ${what}: ${errorMessage(e)}`)
        return undefined
      }
    })
    saveQueue = result.then(() => undefined)
    return result
  }

  return {
    status: { kind: 'loading' },
    folderName: '',
    projects: [],
    settings: defaultSettings(),
    invalid: [],
    notes: {},
    whiteboards: [],
    active: null,
    toast: null,

    async boot() {
      if (booted) return
      booted = true
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('memory')) {
        // Development only: try the UI without picking a folder. Nothing is saved.
        const { MemoryStorage } = await import('../storage/memoryStorage')
        repo = new Repository(new MemoryStorage())
        await repo.initialize()
        await reload()
        return set({ status: { kind: 'ready' }, folderName: 'in-memory (dev)' })
      }
      if (!isFolderAccessSupported()) return set({ status: { kind: 'unsupported' } })
      try {
        const handle = await loadFolderHandle()
        if (!handle) return set({ status: { kind: 'no-folder' } })
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return open(handle)
        pendingHandle = handle
        set({ status: { kind: 'needs-permission', folderName: handle.name } })
      } catch (e) {
        set({ status: { kind: 'error', message: errorMessage(e) } })
      }
    },

    async pickFolder() {
      let handle: FileSystemDirectoryHandle
      try {
        handle = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'projectboard-data' })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        return set({ status: { kind: 'error', message: errorMessage(e) } })
      }
      await saveFolderHandle(handle)
      await open(handle)
    },

    async grantPermission() {
      if (!pendingHandle) return
      if ((await pendingHandle.requestPermission({ mode: 'readwrite' })) === 'granted') await open(pendingHandle)
    },

    async checkExternalChanges() {
      if (!repo || get().status.kind !== 'ready') return
      get().flushWhiteboards()
      await saveQueue
      try {
        if (await repo.hasExternalChanges()) await reload('Files changed outside the app. Reloaded from disk.')
      } catch (e) {
        get().showToast(`Could not read the data folder: ${errorMessage(e)}`)
      }
    },

    setActive(active) {
      get().flushWhiteboards()
      set({ active })
    },

    async createProject(name) {
      if (!repo) return
      try {
        const project = await repo.createProject(name, get().projects)
        set((s) => ({
          projects: [...s.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
          active: { kind: 'project', id: project.id },
        }))
      } catch (e) {
        get().showToast(`Could not create the project: ${errorMessage(e)}`)
      }
    },

    updateProject(id, change) {
      const before = get().projects.find((p) => p.id === id)
      if (!before) return
      const after: LoadedProject = { ...change(before), id }
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? after : p)) }))

      saveQueue = saveQueue.then(async () => {
        const latest = get().projects.find((p) => p.id === id)
        if (!repo || !latest) return
        try {
          const result = await repo.saveProject(latest)
          if (!result.ok) await reload(`"${latest.name}" was changed outside the app. Reloaded from disk; your last change was not saved.`)
        } catch (e) {
          get().showToast(`Could not save "${latest.name}": ${errorMessage(e)}`)
        }
      })
    },

    saveNotes(id, text) {
      if ((get().notes[id] ?? '') === text) return
      set((s) => ({ notes: { ...s.notes, [id]: text } }))

      saveQueue = saveQueue.then(async () => {
        const latest = get().notes[id]
        const name = get().projects.find((p) => p.id === id)?.name ?? id
        if (!repo || latest === undefined) return
        try {
          const result = await repo.saveNotes(id, latest)
          if (!result.ok) await reload(`The notes of "${name}" were changed outside the app. Reloaded from disk; your last change was not saved.`)
        } catch (e) {
          get().showToast(`Could not save the notes of "${name}": ${errorMessage(e)}`)
        }
      })
    },

    async createWhiteboard(name) {
      const board = await runWhiteboardOp('create the whiteboard', (r) => r.createWhiteboard(name))
      if (!board) return
      replaceWhiteboard(board.name, board)
      set({ active: { kind: 'whiteboard', id: board.name } })
    },

    setWhiteboardCanvas(name, canvas) {
      const board = findWhiteboard(name)
      if (!board || board.canvas === canvas) return
      replaceWhiteboard(name, { ...board, canvas })
      clearTimeout(whiteboardTimers.get(name))
      whiteboardTimers.set(
        name,
        setTimeout(() => {
          whiteboardTimers.delete(name)
          queueWhiteboardSave(name)
        }, WHITEBOARD_SAVE_DELAY_MS),
      )
    },

    flushWhiteboards() {
      for (const [name, timer] of whiteboardTimers) {
        clearTimeout(timer)
        queueWhiteboardSave(name)
      }
      whiteboardTimers.clear()
    },

    async renameWhiteboard(name, newName) {
      const board = findWhiteboard(name)
      if (!board) return false
      if (newName.trim() === name) return true
      const renamed = await runWhiteboardOp('rename the whiteboard', (r) => r.renameWhiteboard(board, newName))
      if (!renamed) return false
      afterMove(name, renamed, board)
      if (!sameFileName(renamed.name, newName.trim())) {
        get().showToast(`Saved as "${renamed.name}" because some characters can't be used in file names.`)
      }
      return true
    },

    async setWhiteboardArchived(name, archived) {
      const board = findWhiteboard(name)
      if (!board) return
      const moved = await runWhiteboardOp(archived ? 'archive the whiteboard' : 'restore the whiteboard', (r) =>
        r.setWhiteboardArchived(board, archived),
      )
      if (moved) afterMove(name, moved, board)
    },

    async deleteWhiteboard(name) {
      const board = findWhiteboard(name)
      if (!board) return
      const done = await runWhiteboardOp('delete the whiteboard', async (r) => {
        await r.deleteWhiteboard(board)
        return true
      })
      if (done) replaceWhiteboard(name, null)
    },

    showToast(text) {
      set({ toast: { id: Date.now(), text } })
    },
  }
})
