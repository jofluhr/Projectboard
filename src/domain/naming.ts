/** File-name-safe id for a project, e.g. "Website relaunch" -> "website-relaunch". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'project'
}

export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(name)
  if (!used.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }
}

/** Short card prefix, e.g. "Website relaunch" -> "WEB"; made unique with a digit. */
export function deriveKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const letters = name
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  const base = (letters.slice(0, 3) || 'PRJ').padEnd(2, 'X')
  if (!used.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error('No free project key')
}

/** Windows refuses these as file names, whatever the extension. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/**
 * Turns a whiteboard name into a name that works as a file name on every system:
 * removes characters Windows does not allow and trailing dots and spaces, collapses
 * whitespace. Returns '' if nothing usable is left.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
    .trim()
  return RESERVED_NAMES.test(cleaned) ? `${cleaned}_` : cleaned
}

/** File names that differ only in upper and lower case are the same file on Windows and macOS. */
export const sameFileName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
