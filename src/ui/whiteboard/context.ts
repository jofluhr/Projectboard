import { createContext, useContext } from 'react'
import type { CanvasEdge, TextNode } from '../../domain/canvas'

/** What custom nodes and edges need from the whiteboard they are drawn on. */
export interface WhiteboardActions {
  /** Id of the card whose text, or the edge whose label, is being edited. */
  editingId: string | null
  startEditing(id: string): void
  stopEditing(): void
  updateCard(id: string, change: Partial<TextNode>): void
  updateEdge(id: string, change: Partial<CanvasEdge>): void
}

export const WhiteboardContext = createContext<WhiteboardActions | null>(null)

export function useWhiteboard(): WhiteboardActions {
  const ctx = useContext(WhiteboardContext)
  if (!ctx) throw new Error('useWhiteboard must be used inside a whiteboard')
  return ctx
}
