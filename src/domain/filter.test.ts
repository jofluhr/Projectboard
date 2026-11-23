import { describe, expect, it } from 'vitest'
import { cardMatches, isFiltering, NO_FILTER } from './filter'
import type { Card } from './schema'

const card: Card = {
  num: 7,
  title: 'Paint the fence',
  description: 'Use the green colour',
  priority: 'high',
  labels: ['design'],
  due: null,
  checklist: [],
  completedAt: null,
}

describe('cardMatches', () => {
  it('matches everything without a filter', () => {
    expect(cardMatches(card, 'EXA', NO_FILTER)).toBe(true)
    expect(isFiltering(NO_FILTER)).toBe(false)
  })

  it('searches title, description and id, ignoring case', () => {
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, query: 'FENCE' })).toBe(true)
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, query: 'green' })).toBe(true)
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, query: 'exa-7' })).toBe(true)
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, query: 'roof' })).toBe(false)
  })

  it('filters by label and priority', () => {
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, label: 'design', priority: 'high' })).toBe(true)
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, label: 'bug' })).toBe(false)
    expect(cardMatches(card, 'EXA', { ...NO_FILTER, priority: 'low' })).toBe(false)
  })

  it('treats a blank query as no filter', () => {
    expect(isFiltering({ ...NO_FILTER, query: '  ' })).toBe(false)
  })
})
