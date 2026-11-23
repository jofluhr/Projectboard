import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { useWhiteboard } from './context'
import { colorValue, type FlowEdge } from './flow'
import styles from './Whiteboard.module.css'

/** A connection between two cards, with optional arrowheads and label. */
export function ConnectionEdge(props: EdgeProps<FlowEdge>) {
  const { id, data, selected, markerStart, markerEnd } = props
  const { editingId, startEditing } = useWhiteboard()
  const [path, labelX, labelY] = getBezierPath(props)
  if (!data) return null
  const { edge } = data
  const editing = editingId === id
  const color = colorValue(edge.color) ?? 'var(--muted)'

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={16}
        style={{ stroke: selected ? 'var(--accent)' : color, strokeWidth: selected ? 2.5 : 2 }}
      />
      {(edge.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.edgeLabel} ${selected ? styles.edgeLabelSelected : ''} nodrag nopan`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onDoubleClick={() => startEditing(id)}
          >
            {editing ? <LabelEditor id={id} label={edge.label ?? ''} /> : edge.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function LabelEditor({ id, label }: { id: string; label: string }) {
  const { updateEdge, stopEditing } = useWhiteboard()
  const draft = useRef(label)
  const finished = useRef(false)

  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    const next = draft.current.trim()
    if (save && next !== label) updateEdge(id, { label: next || undefined })
    stopEditing()
  }

  useEffect(
    () => () => {
      const next = draft.current.trim()
      if (!finished.current && next !== label) updateEdge(id, { label: next || undefined })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <input
      className={styles.labelInput}
      autoFocus
      defaultValue={label}
      placeholder="Label"
      aria-label="Connection label"
      size={Math.max(8, label.length + 2)}
      onChange={(e) => (draft.current = e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
    />
  )
}
