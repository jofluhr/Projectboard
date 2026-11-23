import type { Canvas, CanvasEdge, CanvasNode, Side, TextNode } from './canvas'

/** Pure operations on a whiteboard. Every function returns a new canvas. */

export const CARD_WIDTH = 260
export const CARD_HEIGHT = 120
const DUPLICATE_OFFSET = 30

/** 16 hex characters, like the ids Obsidian writes. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Adds a text card centred on (x, y). */
export function addCard(canvas: Canvas, center: { x: number; y: number }, text = '', id = newId()): { canvas: Canvas; id: string } {
  const card: TextNode = {
    id,
    type: 'text',
    text,
    x: Math.round(center.x - CARD_WIDTH / 2),
    y: Math.round(center.y - CARD_HEIGHT / 2),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  }
  return { canvas: { ...canvas, nodes: [...canvas.nodes, card] }, id }
}

/** Changes fields of one node. Setting a field to undefined removes it. */
export function updateNode(canvas: Canvas, id: string, change: Partial<TextNode>): Canvas {
  return {
    ...canvas,
    nodes: canvas.nodes.map((n) => (n.id === id ? dropUndefined({ ...n, ...change } as CanvasNode) : n)),
  }
}

/** Sets position and size of the given nodes; values are rounded to whole pixels. */
export function setGeometry(canvas: Canvas, rects: ReadonlyMap<string, Rect>): Canvas {
  let changed = false
  const nodes = canvas.nodes.map((n) => {
    const r = rects.get(n.id)
    if (!r) return n
    const next = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    if (next.x === n.x && next.y === n.y && next.width === n.width && next.height === n.height) return n
    changed = true
    return { ...n, ...next }
  })
  return changed ? { ...canvas, nodes } : canvas
}

/** Removes nodes and edges. Edges that would lose an end are removed too. */
export function removeElements(canvas: Canvas, nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): Canvas {
  const goneNodes = new Set(nodeIds)
  const goneEdges = new Set(edgeIds)
  return {
    ...canvas,
    nodes: canvas.nodes.filter((n) => !goneNodes.has(n.id)),
    edges: canvas.edges.filter(
      (e) => !goneEdges.has(e.id) && !goneNodes.has(e.fromNode) && !goneNodes.has(e.toNode),
    ),
  }
}

/**
 * Copies the given nodes with new ids, shifted down and right. Edges between two copied
 * nodes are copied as well. Returns the ids of the copies.
 */
export function duplicate(canvas: Canvas, nodeIds: Iterable<string>): { canvas: Canvas; ids: string[] } {
  const wanted = new Set(nodeIds)
  const idMap = new Map<string, string>()
  const copies: CanvasNode[] = []
  for (const n of canvas.nodes) {
    if (!wanted.has(n.id)) continue
    const id = newId()
    idMap.set(n.id, id)
    copies.push({ ...n, id, x: n.x + DUPLICATE_OFFSET, y: n.y + DUPLICATE_OFFSET })
  }
  const edgeCopies: CanvasEdge[] = canvas.edges
    .filter((e) => idMap.has(e.fromNode) && idMap.has(e.toNode))
    .map((e) => ({ ...e, id: newId(), fromNode: idMap.get(e.fromNode)!, toNode: idMap.get(e.toNode)! }))
  return {
    canvas: { ...canvas, nodes: [...canvas.nodes, ...copies], edges: [...canvas.edges, ...edgeCopies] },
    ids: copies.map((c) => c.id),
  }
}

export interface NewEdge {
  fromNode: string
  fromSide?: Side
  toNode: string
  toSide?: Side
}

/**
 * Connects two nodes. The arrowheads are left at the spec defaults (an arrow at the
 * end only). A connection from a node to itself is ignored.
 */
export function addEdge(canvas: Canvas, edge: NewEdge, id = newId()): Canvas {
  if (edge.fromNode === edge.toNode) return canvas
  return { ...canvas, edges: [...canvas.edges, dropUndefined({ id, ...edge })] }
}

/** Changes fields of one edge. Setting a field to undefined removes it. */
export function updateEdge(canvas: Canvas, id: string, change: Partial<CanvasEdge>): Canvas {
  return {
    ...canvas,
    edges: canvas.edges.map((e) => (e.id === id ? dropUndefined({ ...e, ...change }) : e)),
  }
}

/** The side of `from` that faces `to`, for edges a file leaves without sides. */
export function facingSide(from: Rect, to: Rect): Side {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

export const OPPOSITE_SIDE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/**
 * Where a new card goes when a connection is dragged from `side` to the point (x, y):
 * the card's centre is placed so that its facing side touches the point.
 */
export function cardCenterAt(point: { x: number; y: number }, fromSide: Side): { x: number; y: number } {
  switch (fromSide) {
    case 'right':
      return { x: point.x + CARD_WIDTH / 2, y: point.y }
    case 'left':
      return { x: point.x - CARD_WIDTH / 2, y: point.y }
    case 'bottom':
      return { x: point.x, y: point.y + CARD_HEIGHT / 2 }
    case 'top':
      return { x: point.x, y: point.y - CARD_HEIGHT / 2 }
  }
}

/** Optional fields are left out instead of written as undefined (JSON drops them anyway). */
function dropUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}
