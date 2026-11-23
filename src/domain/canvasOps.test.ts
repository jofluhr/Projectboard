import { describe, expect, it } from 'vitest'
import { emptyCanvas, type Canvas } from './canvas'
import {
  addCard,
  addEdge,
  CARD_HEIGHT,
  CARD_WIDTH,
  cardCenterAt,
  duplicate,
  facingSide,
  newId,
  removeElements,
  setGeometry,
  updateEdge,
  updateNode,
} from './canvasOps'

/** Three cards in a row, a -> b -> c. */
function sample(): Canvas {
  let c = emptyCanvas()
  c = addCard(c, { x: 0, y: 0 }, 'A', 'a').canvas
  c = addCard(c, { x: 400, y: 0 }, 'B', 'b').canvas
  c = addCard(c, { x: 800, y: 0 }, 'C', 'c').canvas
  c = addEdge(c, { fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }, 'ab')
  c = addEdge(c, { fromNode: 'b', toNode: 'c' }, 'bc')
  return c
}

describe('newId', () => {
  it('makes 16 hex characters', () => {
    expect(newId()).toMatch(/^[0-9a-f]{16}$/)
    expect(newId()).not.toBe(newId())
  })
})

describe('addCard', () => {
  it('centres an empty text card on the point', () => {
    const { canvas, id } = addCard(emptyCanvas(), { x: 100, y: 50 })
    expect(canvas.nodes).toEqual([
      { id, type: 'text', text: '', x: 100 - CARD_WIDTH / 2, y: 50 - CARD_HEIGHT / 2, width: CARD_WIDTH, height: CARD_HEIGHT },
    ])
  })
})

describe('updateNode and updateEdge', () => {
  it('changes fields and drops fields set to undefined', () => {
    let c = updateNode(sample(), 'a', { text: 'New', color: '2' })
    expect(c.nodes[0]).toMatchObject({ text: 'New', color: '2' })
    c = updateNode(c, 'a', { color: undefined })
    expect(c.nodes[0]).not.toHaveProperty('color')

    c = updateEdge(c, 'ab', { label: 'why', fromEnd: 'arrow' })
    expect(c.edges[0]).toMatchObject({ label: 'why', fromEnd: 'arrow' })
    c = updateEdge(c, 'ab', { label: undefined })
    expect(c.edges[0]).not.toHaveProperty('label')
  })
})

describe('setGeometry', () => {
  it('rounds values and returns the same canvas when nothing moved', () => {
    const c = sample()
    const a = c.nodes[0]!
    expect(setGeometry(c, new Map([['a', { x: a.x, y: a.y, width: a.width, height: a.height }]]))).toBe(c)
    const moved = setGeometry(c, new Map([['a', { x: 10.4, y: 20.6, width: 300, height: 99.5 }]]))
    expect(moved.nodes[0]).toMatchObject({ x: 10, y: 21, width: 300, height: 100 })
  })
})

describe('removeElements', () => {
  it('removes edges that lose an end', () => {
    const c = removeElements(sample(), ['b'])
    expect(c.nodes.map((n) => n.id)).toEqual(['a', 'c'])
    expect(c.edges).toEqual([])
  })

  it('removes single edges', () => {
    const c = removeElements(sample(), [], ['bc'])
    expect(c.edges.map((e) => e.id)).toEqual(['ab'])
  })
})

describe('duplicate', () => {
  it('copies nodes with new ids and only the edges between copied nodes', () => {
    const { canvas, ids } = duplicate(sample(), ['a', 'b'])
    expect(canvas.nodes).toHaveLength(5)
    expect(ids).toHaveLength(2)
    const [copyA, copyB] = ids.map((id) => canvas.nodes.find((n) => n.id === id)!)
    expect(copyA).toMatchObject({ text: 'A', x: sample().nodes[0]!.x + 30 })
    const newEdges = canvas.edges.slice(2)
    expect(newEdges).toHaveLength(1)
    expect(newEdges[0]).toMatchObject({ fromNode: copyA!.id, toNode: copyB!.id, fromSide: 'right', toSide: 'left' })
    expect(newEdges[0]!.id).not.toBe('ab')
  })
})

describe('addEdge', () => {
  it('ignores connections from a node to itself and keeps arrow defaults implicit', () => {
    const c = sample()
    expect(addEdge(c, { fromNode: 'a', toNode: 'a' })).toBe(c)
    expect(c.edges[1]).toEqual({ id: 'bc', fromNode: 'b', toNode: 'c' })
  })
})

describe('geometry helpers', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 100 })

  it('finds the side facing another node', () => {
    expect(facingSide(box(0, 0), box(300, 20))).toBe('right')
    expect(facingSide(box(0, 0), box(-300, 0))).toBe('left')
    expect(facingSide(box(0, 0), box(10, 300))).toBe('bottom')
    expect(facingSide(box(0, 0), box(0, -300))).toBe('top')
  })

  it('places a new card so its facing side touches the drop point', () => {
    expect(cardCenterAt({ x: 0, y: 0 }, 'right')).toEqual({ x: CARD_WIDTH / 2, y: 0 })
    expect(cardCenterAt({ x: 0, y: 0 }, 'top')).toEqual({ x: 0, y: -CARD_HEIGHT / 2 })
  })
})
