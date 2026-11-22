/**
 * Access to the data folder. Paths are relative and use "/" (e.g. "projects/website.json").
 * The browser implementation uses the File System Access API; a Tauri implementation
 * could replace it later without touching the rest of the app.
 */
export interface Storage {
  /** Display name of the folder. */
  readonly name: string
  /** null if the file does not exist. */
  read(path: string): Promise<FileContent | null>
  /** Creates missing folders. Returns the file's new lastModified. */
  write(path: string, text: string): Promise<number>
  /** lastModified, or null if the file does not exist. */
  stat(path: string): Promise<number | null>
  /** File names (not folders) directly inside `dir`; empty if `dir` does not exist. */
  list(dir: string): Promise<string[]>
  /** Folder names directly inside `dir`; empty if `dir` does not exist. */
  listDirs(dir: string): Promise<string[]>
  remove(path: string): Promise<void>
}

export interface FileContent {
  text: string
  lastModified: number
}
