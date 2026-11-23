import { describe, expect, it } from 'vitest'
import { CanvasSchema, fromEndOf, isTextNode, toEndOf } from './canvas'

/** Shaped like a file written by another JSON Canvas tool, with all node types. */
const FOREIGN_FILE = {
  nodes: [
    { id: 'a1', type: 'text', text: '# Idea\n\n- one\n- two', x: -100, y: 0, width: 250, height: 120, color: '4' },
    { id: 'b2', type: 'file', file: 'Notes/Example.md', x: 300, y: 0, width: 400, height: 300 },
    { id: 'c3', type: 'link', url: 'https://example.com', x: 300, y: 400, width: 400, height: 300 },
    { id: 'd4', type: 'group', label: 'Cluster', x: -200, y: -100, width: 1000, height: 900, background: 'img.png' },
  ],
  edges: [
    { id: 'e1', fromNode: 'a1', fromSide: 'right', toNode: 'b2', toSide: 'left', label: 'see', color: '#ff8800' },
    { id: 'e2', fromNode: 'a1', toNode: 'c3', fromEnd: 'arrow', toEnd: 'none' },
  ],
  extraTopLevel: { kept: true },
}

describe('CanvasSchema', () => {
  it('reads every node type and keeps fields it does not know', () => {
    const canvas = CanvasSchema.parse(FOREIGN_FILE)
    expect(canvas.nodes.map((n) => n.type)).toEqual(['text', 'file', 'link', 'group'])
    expect(canvas.nodes[3]).toMatchObject({ label: 'Cluster', background: 'img.png' })
    expect(canvas).toMatchObject({ extraTopLevel: { kept: true } })
    // Round trip: nothing is lost.
    expect(JSON.parse(JSON.stringify(canvas))).toEqual(FOREIGN_FILE)
  })

  it('accepts an empty object as an empty canvas', () => {
    expect(CanvasSchema.parse({})).toEqual({ nodes: [], edges: [] })
  })

  it('rejects text nodes without text and nodes without geometry', () => {
    expect(CanvasSchema.safeParse({ nodes: [{ id: 'x', type: 'text', x: 0, y: 0, width: 1, height: 1 }] }).success).toBe(false)
    expect(CanvasSchema.safeParse({ nodes: [{ id: 'x', type: 'file', file: 'a.md' }] }).success).toBe(false)
  })

  it('rejects unknown sides and ends', () => {
    const edge = { id: 'e', fromNode: 'a', toNode: 'b' }
    expect(CanvasSchema.safeParse({ edges: [{ ...edge, fromSide: 'middle' }] }).success).toBe(false)
    expect(CanvasSchema.safeParse({ edges: [{ ...edge, toEnd: 'circle' }] }).success).toBe(false)
  })
})

describe('helpers', () => {
  it('uses the spec defaults for arrowheads', () => {
    const edge = { id: 'e', fromNode: 'a', toNode: 'b' }
    expect(fromEndOf(edge)).toBe('none')
    expect(toEndOf(edge)).toBe('arrow')
  })

  it('tells text nodes apart', () => {
    const canvas = CanvasSchema.parse(FOREIGN_FILE)
    expect(canvas.nodes.filter(isTextNode).map((n) => n.id)).toEqual(['a1'])
  })
})
