import { describe, expect, it } from 'vitest'
import { deriveKey, slugify, uniqueSlug } from './naming'

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
