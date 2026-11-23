import { z } from 'zod'

/**
 * Whiteboards are stored in the open JSON Canvas format (jsoncanvas.org), the same
 * format Obsidian uses for `.canvas` files. Fields the app does not know about are
 * kept as they are, so a board edited in another tool survives a round trip.
 */

export const SIDES = ['top', 'right', 'bottom', 'left'] as const
export const SideSchema = z.enum(SIDES)
export const EndSchema = z.enum(['none', 'arrow'])

/** JSON Canvas preset colours. The spec also allows hex values like "#ff0000". */
export const PRESET_COLORS = ['1', '2', '3', '4', '5', '6'] as const

const NodeBaseSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string().optional(),
})

export const TextNodeSchema = NodeBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
})

/** file, link and group nodes. Shown as placeholders and never changed except for position and size. */
export const OtherNodeSchema = NodeBaseSchema.extend({
  type: z.string().refine((t) => t !== 'text', 'Text nodes need a "text" field'),
})

export const CanvasNodeSchema = z.union([TextNodeSchema, OtherNodeSchema])

export const CanvasEdgeSchema = z.looseObject({
  id: z.string().min(1),
  fromNode: z.string(),
  fromSide: SideSchema.optional(),
  fromEnd: EndSchema.optional(),
  toNode: z.string(),
  toSide: SideSchema.optional(),
  toEnd: EndSchema.optional(),
  color: z.string().optional(),
  label: z.string().optional(),
})

export const CanvasSchema = z.looseObject({
  nodes: z.array(CanvasNodeSchema).default([]),
  edges: z.array(CanvasEdgeSchema).default([]),
})

export type Side = z.infer<typeof SideSchema>
export type End = z.infer<typeof EndSchema>
export type TextNode = z.infer<typeof TextNodeSchema>
export type CanvasNode = z.infer<typeof CanvasNodeSchema>
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>
export type Canvas = z.infer<typeof CanvasSchema>

/** A whiteboard file. The name is the file name without `.canvas` and is the board's id. */
export interface LoadedWhiteboard {
  name: string
  archived: boolean
  canvas: Canvas
}

export const isTextNode = (node: CanvasNode): node is TextNode => node.type === 'text'

export const emptyCanvas = (): Canvas => ({ nodes: [], edges: [] })

/** Arrowhead defaults of the spec: none at the start, an arrow at the end. */
export const fromEndOf = (edge: CanvasEdge): End => edge.fromEnd ?? 'none'
export const toEndOf = (edge: CanvasEdge): End => edge.toEnd ?? 'arrow'
