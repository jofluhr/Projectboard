import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { isTextNode, SIDES, type Side } from '../../domain/canvas'
import { renderMarkdown } from '../notes/renderMarkdown'
import { useWhiteboard } from './context'
import { colorValue, type FlowNode } from './flow'
import styles from './Whiteboard.module.css'

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

/** One connection point per side. Loose connection mode lets any handle start or end an edge. */
function SideHandles() {
  return SIDES.map((side) => (
    <Handle key={side} id={side} type="source" position={POSITION[side]} className={styles.handle} />
  ))
}

function colorStyle(color: string | undefined): CSSProperties | undefined {
  const c = colorValue(color)
  return c ? ({ '--c': c } as CSSProperties) : undefined
}

/** A text card. Shows its Markdown, or a text area while being edited. */
export function CardNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { editingId } = useWhiteboard()
  const node = data.node
  if (!isTextNode(node)) return null
  const editing = editingId === id
  const colored = colorValue(node.color) !== undefined

  return (
    <div
      className={`${styles.card} ${colored ? styles.colored : ''} ${selected ? styles.selected : ''}`}
      style={colorStyle(node.color)}
    >
      <NodeResizer isVisible={selected && !editing} minWidth={80} minHeight={40} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
      <SideHandles />
      {editing ? (
        <CardEditor id={id} text={node.text} />
      ) : node.text.trim() ? (
        <div
          className={`${styles.cardBody} ${selected ? 'nowheel' : ''}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(node.text) }}
        />
      ) : (
        <div className={`${styles.cardBody} ${styles.cardEmpty}`}>Double-click to write</div>
      )}
    </div>
  )
}

function CardEditor({ id, text }: { id: string; text: string }) {
  const { updateCard, stopEditing } = useWhiteboard()
  const draft = useRef(text)
  const finished = useRef(false)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    if (draft.current !== text) updateCard(id, { text: draft.current })
    stopEditing()
  }

  // Keep the text if the editor disappears without a blur, e.g. when switching boards.
  useEffect(
    () => () => {
      if (!finished.current && draft.current !== text) updateCard(id, { text: draft.current })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <textarea
      className={`${styles.editor} nodrag nowheel nopan`}
      autoFocus
      defaultValue={text}
      aria-label="Card text (Markdown)"
      onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
      onChange={(e) => (draft.current = e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          finish()
        }
      }}
    />
  )
}

/**
 * File, link and group nodes from files made in other tools. They can be moved,
 * resized, connected and deleted, but their content is not edited here.
 */
export function PlaceholderNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node
  const field = (key: string) => (typeof node[key] === 'string' ? (node[key] as string) : '')
  const isGroup = node.type === 'group'
  const detail = isGroup ? field('label') : field('file') || field('url')

  return (
    <div
      className={`${isGroup ? styles.group : styles.placeholder} ${colorValue(node.color) ? styles.colored : ''} ${selected ? styles.selected : ''}`}
      style={colorStyle(node.color)}
      title={`${node.type} node from another canvas tool; its content can't be edited here`}
    >
      <NodeResizer isVisible={selected} minWidth={60} minHeight={40} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
      <SideHandles />
      <span className={styles.placeholderType}>{node.type}</span>
      {detail && <span className={styles.placeholderDetail}>{detail}</span>}
    </div>
  )
}
