import { describe, expect, it } from 'vitest'
import { deriveKey, sameFileName, sanitizeFileName, slugify, uniqueSlug } from './naming'

describe('slugify', () => {
  it('makes file-name-safe ids', () => {
    expect(slugify('Website relaunch')).toBe('website-relaunch')
    expect(slugify('  Größe & Übung!  ')).toBe('grosse-ubung')
    expect(slugify('***')).toBe('project')
  })

  it('adds a counter when the id is taken', () => {
    expect(uniqueSlug('Garden', ['garden', 'garden-2'])).toBe('garden-3')
  })
})

describe('deriveKey', () => {
  it('uses the first three letters', () => {
    expect(deriveKey('Website relaunch', [])).toBe('WEB')
  })

  it('adds a digit when the key is taken', () => {
    expect(deriveKey('Webshop', ['WEB'])).toBe('WEB2')
  })

  it('falls back for names without letters', () => {
    expect(deriveKey('2027', [])).toBe('PRJ')
    expect(deriveKey('X', [])).toBe('XX')
  })
})

describe('sanitizeFileName', () => {
  it('keeps readable names as they are', () => {
    expect(sanitizeFileName('App architecture')).toBe('App architecture')
    expect(sanitizeFileName('Größe & Übung (v2)')).toBe('Größe & Übung (v2)')
  })

  it('removes characters Windows does not allow and trailing dots and spaces', () => {
    expect(sanitizeFileName('a/b\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(sanitizeFileName('  Ideas...  ')).toBe('Ideas')
    expect(sanitizeFileName('two   words')).toBe('two words')
  })

  it('returns an empty string when nothing is left and avoids reserved names', () => {
    expect(sanitizeFileName(' ?*. ')).toBe('')
    expect(sanitizeFileName('CON')).toBe('CON_')
  })

  it('compares file names without case', () => {
    expect(sameFileName('Ideas', 'IDEAS')).toBe(true)
    expect(sameFileName('Ideas', 'Ideas 2')).toBe(false)
  })
})
