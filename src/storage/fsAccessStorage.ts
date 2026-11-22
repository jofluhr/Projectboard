import type { FileContent, Storage } from './types'

function isMissing(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')
}

function split(path: string): { dirs: string[]; file: string } {
  const parts = path.split('/').filter(Boolean)
  const file = parts.pop()
  if (!file) throw new Error(`Invalid path: ${path}`)
  return { dirs: parts, file }
}

/** Storage backed by a folder the user picked (File System Access API). */
export class FsAccessStorage implements Storage {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.root.name
  }

  private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create })
    return dir
  }

  private async fileHandle(path: string): Promise<FileSystemFileHandle | null> {
    const { dirs, file } = split(path)
    try {
      return await (await this.dir(dirs, false)).getFileHandle(file)
    } catch (e) {
      if (isMissing(e)) return null
      throw e
    }
  }

  async read(path: string): Promise<FileContent | null> {
    const handle = await this.fileHandle(path)
    if (!handle) return null
    const file = await handle.getFile()
    return { text: await file.text(), lastModified: file.lastModified }
  }

  async write(path: string, text: string): Promise<number> {
    const { dirs, file } = split(path)
    const handle = await (await this.dir(dirs, true)).getFileHandle(file, { create: true })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return (await handle.getFile()).lastModified
  }

  async stat(path: string): Promise<number | null> {
    const handle = await this.fileHandle(path)
    return handle ? (await handle.getFile()).lastModified : null
  }

  async list(dirPath: string): Promise<string[]> {
    return this.entries(dirPath, 'file')
  }

  async listDirs(dirPath: string): Promise<string[]> {
    return this.entries(dirPath, 'directory')
  }

  private async entries(dirPath: string, kind: FileSystemHandleKind): Promise<string[]> {
    let dir: FileSystemDirectoryHandle
    try {
      dir = await this.dir(dirPath.split('/').filter(Boolean), false)
    } catch (e) {
      if (isMissing(e)) return []
      throw e
    }
    const names: string[] = []
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === kind) names.push(name)
    }
    return names
  }

  async remove(path: string): Promise<void> {
    const { dirs, file } = split(path)
    await (await this.dir(dirs, false)).removeEntry(file)
  }
}
