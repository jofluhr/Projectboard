import type { FileContent, Storage } from './types'

/** In-memory Storage for tests. Every write gets a strictly newer lastModified. */
export class MemoryStorage implements Storage {
  readonly name = 'memory'
  readonly files = new Map<string, FileContent>()
  private clock = 1_000

  async read(path: string): Promise<FileContent | null> {
    return this.files.get(path) ?? null
  }

  async write(path: string, text: string): Promise<number> {
    const lastModified = ++this.clock
    this.files.set(path, { text, lastModified })
    return lastModified
  }

  async stat(path: string): Promise<number | null> {
    return this.files.get(path)?.lastModified ?? null
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir ? `${dir}/` : ''
    return [...this.files.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => p.slice(prefix.length))
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }
}
