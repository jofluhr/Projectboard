import { describe, expect, it } from 'vitest'
import { addCard, addColumn, deleteCard, isOverWip, moveCard, newProject, normalizeProject, projectStats, updateCard } from './ops'
import type { Project } from './schema'

const NOW = new Date('2026-03-10T09:00:00Z')
const LATER = new Date('2026-03-12T15:30:00Z')

function nums(p: Project): number[][] {
  return p.columns.map((c) => c.cards.map((card) => card.num))
}

function sample(): Project {
  let p = newProject('Example project', 'EXA', NOW)
  p = addCard(p, 0, 'First', NOW)
  p = addCard(p, 0, 'Second', NOW)
  p = addCard(p, 0, 'Third', NOW)
  p = addCard(p, 1, 'Fourth', NOW)
  return p
}

describe('addCard', () => {
  it('numbers cards sequentially and appends them to the column', () => {
    const p = sample()
    expect(nums(p)).toEqual([[1, 2, 3], [4], []])
    expect(p.nextNumber).toBe(5)
  })

  it('marks a card created in a done column as completed', () => {
    const p = addCard(newProject('X', 'X', NOW), 2, 'Already done', NOW)
    expect(p.columns[2]!.cards[0]!.completedAt).toBe(NOW.toISOString())
  })

  it('does not mutate its input', () => {
    const p = sample()
    const copy = structuredClone(p)
    addCard(p, 0, 'New', NOW)
    expect(p).toEqual(copy)
  })
})

describe('moveCard', () => {
  it('reorders within a column', () => {
    expect(nums(moveCard(sample(), 1, 0, 2, NOW))).toEqual([[2, 3, 1], [4], []])
    expect(nums(moveCard(sample(), 3, 0, 0, NOW))).toEqual([[3, 1, 2], [4], []])
  })

  it('moves to another column at the given position', () => {
    expect(nums(moveCard(sample(), 2, 1, 0, NOW))).toEqual([[1, 3], [2, 4], []])
    expect(nums(moveCard(sample(), 2, 1, 99, NOW))).toEqual([[1, 3], [4, 2], []])
  })

  it('sets completedAt when entering a done column and clears it when leaving', () => {
    const done = moveCard(sample(), 1, 2, 0, NOW)
    expect(done.columns[2]!.cards[0]!.completedAt).toBe(NOW.toISOString())

    const reordered = moveCard(addCard(done, 2, 'Other', NOW), 1, 2, 1, LATER)
    expect(reordered.columns[2]!.cards[1]!.completedAt).toBe(NOW.toISOString())

    const reopened = moveCard(done, 1, 0, 0, LATER)
    expect(reopened.columns[0]!.cards[0]!.completedAt).toBeNull()
  })

  it('ignores unknown cards and columns', () => {
    const p = sample()
    expect(moveCard(p, 99, 0, 0, NOW)).toBe(p)
    expect(moveCard(p, 1, 9, 0, NOW)).toBe(p)
  })
})

describe('addColumn', () => {
  it('inserts in front of the done column', () => {
    const { project, index } = addColumn(sample(), 'Review')
    expect(index).toBe(2)
    expect(project.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', 'Review', 'Done'])
  })
})

describe('isOverWip', () => {
  it('only flags columns with a limit', () => {
    expect(isOverWip({ wipLimit: 0 }, 10)).toBe(false)
    expect(isOverWip({ wipLimit: 3 }, 3)).toBe(false)
    expect(isOverWip({ wipLimit: 3 }, 4)).toBe(true)
  })
})

describe('projectStats', () => {
  it('counts done and overdue cards', () => {
    let p = sample()
    p = moveCard(p, 1, 2, 0, NOW)
    p.columns[0]!.cards[0]!.due = '2026-03-09' // card 2, overdue
    p.columns[0]!.cards[1]!.due = '2026-03-10' // card 3, due today
    p.columns[2]!.cards[0]!.due = '2026-03-01' // card 1, done: not overdue
    expect(projectStats(p, new Date(2026, 2, 10))).toEqual({ total: 4, done: 1, open: 3, overdue: 1 })
  })
})

describe('normalizeProject', () => {
  it('raises nextNumber above the highest card number', () => {
    const p = { ...sample(), nextNumber: 2 }
    expect(normalizeProject(p).nextNumber).toBe(5)
  })
})

describe('updateCard', () => {
  it('changes only the given fields of the given card', () => {
    const p = updateCard(sample(), 2, { title: 'Renamed', priority: 'high', checklist: [{ text: 'Step', done: true }] })
    const card = p.columns[0]!.cards[1]!
    expect(card).toMatchObject({ num: 2, title: 'Renamed', priority: 'high', checklist: [{ text: 'Step', done: true }] })
    expect(p.columns[0]!.cards[0]!.title).toBe('First')
  })

  it('returns the project unchanged for an unknown card', () => {
    const p = sample()
    expect(updateCard(p, 99, { title: 'X' })).toBe(p)
  })

  it('does not mutate its input', () => {
    const p = sample()
    const copy = structuredClone(p)
    updateCard(p, 1, { labels: ['bug'] })
    expect(p).toEqual(copy)
  })
})

describe('deleteCard', () => {
  it('removes the card and keeps the numbering', () => {
    const p = deleteCard(sample(), 2)
    expect(nums(p)).toEqual([[1, 3], [4], []])
    expect(p.nextNumber).toBe(5)
  })

  it('returns the project unchanged for an unknown card', () => {
    const p = sample()
    expect(deleteCard(p, 99)).toBe(p)
  })
})
