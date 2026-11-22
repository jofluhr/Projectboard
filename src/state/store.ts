import { create } from 'zustand'
import { defaultSettings, type LoadedProject, type Project, type Settings } from '../domain/schema'
import { Repository, type InvalidFile } from '../repo/repository'
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

interface AppState {
  status: Status
  folderName: string
  projects: LoadedProject[]
  settings: Settings
  invalid: InvalidFile[]
  /** Notes text per project id; missing means the project has no notes file yet. */
  notes: Record<string, string>
  activeId: string | null
  toast: Toast | null

  boot(): Promise<void>
  pickFolder(): Promise<void>
  grantPermission(): Promise<void>
  checkExternalChanges(): Promise<void>
  setActive(id: string): void
  createProject(name: string): Promise<void>
  /** Applies `change` right away and saves the project in the background. */
  updateProject(id: string, change: (p: Project) => Project): void
  /** Sets the notes right away and saves them in the background. */
  saveNotes(id: string, text: string): void
  showToast(text: string): void
}

let repo: Repository | null = null
let pendingHandle: FileSystemDirectoryHandle | null = null
let booted = false
/** Saves run one after another so writes never overlap. */
let saveQueue: Promise<void> = Promise.resolve()

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
    const { projects, settings, invalid, notes, migrated } = await repo.loadAll()
    const visible = projects.filter((p) => !p.archived)
    const current = get().activeId
    const activeId = visible.some((p) => p.id === current) ? current : (visible[0]?.id ?? null)
    set({ projects, settings, invalid, notes, activeId })
    if (migrated > 0) notice = `Moved ${migrated} project file${migrated === 1 ? '' : 's'} into project folders.`
    if (notice) get().showToast(notice)
  }

  return {
    status: { kind: 'loading' },
    folderName: '',
    projects: [],
    settings: defaultSettings(),
    invalid: [],
    notes: {},
    activeId: null,
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
      await saveQueue
      try {
        if (await repo.hasExternalChanges()) await reload('Files changed outside the app. Reloaded from disk.')
      } catch (e) {
        get().showToast(`Could not read the data folder: ${errorMessage(e)}`)
      }
    },

    setActive(id) {
      set({ activeId: id })
    },

    async createProject(name) {
      if (!repo) return
      try {
        const project = await repo.createProject(name, get().projects)
        set((s) => ({
          projects: [...s.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
          activeId: project.id,
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

    showToast(text) {
      set({ toast: { id: Date.now(), text } })
    },
  }
})
