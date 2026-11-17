// Parts of the File System Access API that TypeScript's DOM types do not include yet.
// Available in Chromium browsers (Edge, Chrome), not in Firefox or Safari.
export {}

type PermissionMode = { mode?: 'read' | 'readwrite' }

declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: PermissionMode): Promise<PermissionState>
    requestPermission(descriptor?: PermissionMode): Promise<PermissionState>
  }

  interface Window {
    showDirectoryPicker?(options?: PermissionMode & { id?: string; startIn?: string }): Promise<FileSystemDirectoryHandle>
  }
}
