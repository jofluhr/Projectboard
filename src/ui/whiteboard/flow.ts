import { MarkerType, type Edge, type EdgeMarker, type Node } from '@xyflow/react'
import { fromEndOf, PRESET_COLORS, SIDES, toEndOf, type Canvas, type CanvasEdge, type CanvasNode, type Side } from '../../domain/canvas'
import { facingSide, type Rect } from '../../domain/canvasOps'

/**
 * The whiteboard as React Flow sees it. The canvas (JSON Canvas) is the source of truth;
 * flow nodes and edges carry the original element in `data` plus React Flow's own
 * state such as selection.
 */
export type FlowNode = Node<{ node: CanvasNode }, 'card' | 'placeholder'>
export type FlowEdge = Edge<{ edge: CanvasEdge }, 'connection'>

/** CSS colour for a JSON Canvas colour: a preset number or a hex value. */
export function colorValue(color: string | undefined): string | undefined {
  if (!color) return undefined
  return (PRESET_COLORS as readonly string[]).includes(color) ? `var(--canvas-${color})` : color
}

/**
 * Builds flow nodes from the canvas. Selection is taken from `select` if given, else
 * kept from the previous flow nodes.
 */
export function toFlowNodes(canvas: Canvas, prev: readonly FlowNode[], select?: ReadonlySet<string>): FlowNode[] {
  const prevById = new Map(prev.map((n) => [n.id, n]))
  return canvas.nodes.map((node) => ({
    id: node.id,
    type: node.type === 'text' ? 'card' : 'placeholder',
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    // Groups lie behind everything else, as in other canvas tools.
    zIndex: node.type === 'group' ? -1 : undefined,
    selected: select ? select.has(node.id) : (prevById.get(node.id)?.selected ?? false),
    data: { node },
  }))
}

export function toFlowEdges(canvas: Canvas, prev: readonly FlowEdge[], select?: ReadonlySet<string>): FlowEdge[] {
  const prevById = new Map(prev.map((e) => [e.id, e]))
  const nodesById = new Map(canvas.nodes.map((n) => [n.id, n]))
  const edges: FlowEdge[] = []
  for (const edge of canvas.edges) {
    const from = nodesById.get(edge.fromNode)
    const to = nodesById.get(edge.toNode)
    if (!from || !to) continue // A file may point to a missing node; such edges are not drawn.
    const color = colorValue(edge.color) ?? 'var(--muted)'
    const marker = (end: 'none' | 'arrow'): EdgeMarker | undefined =>
      end === 'arrow' ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined
    edges.push({
      id: edge.id,
      type: 'connection',
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: edge.fromSide ?? facingSide(from, to),
      targetHandle: edge.toSide ?? facingSide(to, from),
      markerStart: marker(fromEndOf(edge)),
      markerEnd: marker(toEndOf(edge)),
      selected: select ? select.has(edge.id) : (prevById.get(edge.id)?.selected ?? false),
      data: { edge },
    })
  }
  return edges
}

/** Position and size of each flow node, to write back into the canvas. */
export function flowGeometry(nodes: readonly FlowNode[]): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const n of nodes) {
    const width = n.width ?? n.measured?.width
    const height = n.height ?? n.measured?.height
    if (width === undefined || height === undefined) continue
    rects.set(n.id, { x: n.position.x, y: n.position.y, width, height })
  }
  return rects
}

export const isSide = (value: unknown): value is Side => (SIDES as readonly unknown[]).includes(value)
