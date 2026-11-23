import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChangeset,
  type EdgeTypes,
  type NodeChangeset,
  type NodeTypes,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { fromEndOf, isTextNode, PRESET_COLORS, toEndOf, type Canvas, type CanvasEdge, type LoadedWhiteboard, type TextNode } from '../../domain/canvas'
import {
  addCard,
  addEdge,
  cardCenterAt,
  duplicate,
  facingSide,
  OPPOSITE_SIDE,
  removeElements,
  setGeometry,
  updateEdge,
  updateNode,
} from '../../domain/canvasOps'
import { useStore } from '../../state/store'
import { ConnectionEdge } from './ConnectionEdge'
import { WhiteboardContext, type WhiteboardActions } from './context'
import { colorValue, flowGeometry, isSide, toFlowEdges, toFlowNodes, type FlowEdge, type FlowNode } from './flow'
import { CardNode, PlaceholderNode } from './nodes'
import { useHistory } from './useHistory'
import styles from './Whiteboard.module.css'

const nodeTypes: NodeTypes = { card: CardNode, placeholder: PlaceholderNode } as NodeTypes
const edgeTypes: EdgeTypes = { connection: ConnectionEdge } as EdgeTypes

export function WhiteboardView({ board }: { board: LoadedWhiteboard }) {
  return (
    <div className={styles.view}>
      <WhiteboardHeader board={board} />
      <div className={styles.canvasFrame}>
        <ReactFlowProvider>
          <WhiteboardCanvas board={board} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function WhiteboardHeader({ board }: { board: LoadedWhiteboard }) {
  const rename = useStore((s) => s.renameWhiteboard)
  const setArchived = useStore((s) => s.setWhiteboardArchived)
  const remove = useStore((s) => s.deleteWhiteboard)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(board.name)

  const finishRename = (save: boolean) => {
    setRenaming(false)
    if (save && draft.trim() && draft.trim() !== board.name) void rename(board.name, draft)
  }

  return (
    <header className={styles.header}>
      {renaming ? (
        <input
          className={styles.renameInput}
          autoFocus
          value={draft}
          aria-label="Whiteboard name"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => finishRename(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishRename(true)
            if (e.key === 'Escape') finishRename(false)
          }}
        />
      ) : (
        <h1>
          <button
            type="button"
            className={styles.title}
            title="Rename"
            onClick={() => {
              setDraft(board.name)
              setRenaming(true)
            }}
          >
            {board.name}
          </button>
        </h1>
      )}
      {board.archived && <span className={styles.badge}>Archived</span>}
      <div className={styles.headerActions}>
        {board.archived ? (
          <>
            <button type="button" className="btn btn-sm" onClick={() => void setArchived(board.name, false)}>
              Restore
            </button>
            <button
              type="button"
              className={`btn btn-sm ${styles.danger}`}
              onClick={() => {
                if (window.confirm(`Delete the whiteboard "${board.name}" for good? This can't be undone.`)) {
                  void remove(board.name)
                }
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => void setArchived(board.name, true)}>
            Archive
          </button>
        )}
      </div>
    </header>
  )
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

function pointerPosition(event: MouseEvent | TouchEvent): { x: number; y: number } {
  const p = 'changedTouches' in event ? event.changedTouches[0]! : event
  return { x: p.clientX, y: p.clientY }
}

function WhiteboardCanvas({ board }: { board: LoadedWhiteboard }) {
  const setWhiteboardCanvas = useStore((s) => s.setWhiteboardCanvas)
  const { screenToFlowPosition, fitView } = useReactFlow<FlowNode, FlowEdge>()

  /** The canvas as last committed by this view; the store holds the same object. */
  const canvasRef = useRef(board.canvas)
  const [nodes, setNodes] = useState(() => toFlowNodes(board.canvas, []))
  const [edges, setEdges] = useState(() => toFlowEdges(board.canvas, []))
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [editingId, setEditingId] = useState<string | null>(null)
  const history = useHistory(board.canvas)
  const { push: pushHistory, reset: resetHistory } = history
  const flowRef = useRef<HTMLDivElement>(null)

  // The file was reloaded from disk (changed outside the app): start over from it.
  useEffect(() => {
    if (board.canvas === canvasRef.current) return
    canvasRef.current = board.canvas
    setNodes((prev) => toFlowNodes(board.canvas, prev))
    setEdges((prev) => toFlowEdges(board.canvas, prev))
    resetHistory(board.canvas)
    setEditingId(null)
  }, [board.canvas, resetHistory])

  /**
   * Makes `next` the board's content: redraws, records an undo step and saves.
   * `select` replaces the selection with the given node and edge ids.
   */
  const commit = useCallback(
    (next: Canvas, options: { select?: string[]; record?: boolean } = {}) => {
      if (next === canvasRef.current) return
      canvasRef.current = next
      const select = options.select ? new Set(options.select) : undefined
      setNodes((prev) => toFlowNodes(next, prev, select))
      setEdges((prev) => toFlowEdges(next, prev, select))
      if (options.record !== false) pushHistory(next)
      setWhiteboardCanvas(board.name, next)
    },
    [board.name, pushHistory, setWhiteboardCanvas],
  )

  const createCardAt = useCallback(
    (center: { x: number; y: number }, connectFrom?: { node: string; side: ReturnType<typeof facingSide> }) => {
      const added = addCard(canvasRef.current, center)
      let next = added.canvas
      if (connectFrom) {
        next = addEdge(next, {
          fromNode: connectFrom.node,
          fromSide: connectFrom.side,
          toNode: added.id,
          toSide: OPPOSITE_SIDE[connectFrom.side],
        })
      }
      commit(next, { select: [added.id] })
      setEditingId(added.id)
    },
    [commit],
  )

  const onNodesChange = useCallback(
    (changes: NodeChangeset<FlowNode>) => {
      const next = changes.applyTo(nodesRef.current)
      nodesRef.current = next
      setNodes(next)
      // Positions and sizes are saved when a drag or resize ends, not on every frame.
      const ended = changes
        .toArray()
        .some((c) => (c.type === 'position' && c.dragging === false) || (c.type === 'dimensions' && c.resizing === false))
      if (ended) commit(setGeometry(canvasRef.current, flowGeometry(next)))
    },
    [commit],
  )

  const onEdgesChange = useCallback((changes: EdgeChangeset<FlowEdge>) => {
    setEdges((eds) => changes.applyTo(eds))
  }, [])

  const onDelete = useCallback(
    ({ nodes: goneNodes, edges: goneEdges }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
      commit(removeElements(canvasRef.current, goneNodes.map((n) => n.id), goneEdges.map((e) => e.id)))
    },
    [commit],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      commit(
        addEdge(canvasRef.current, {
          fromNode: c.source,
          fromSide: isSide(c.sourceHandle) ? c.sourceHandle : undefined,
          toNode: c.target,
          toSide: isSide(c.targetHandle) ? c.targetHandle : undefined,
        }),
      )
    },
    [commit],
  )

  // Dropping a connection on empty space creates a new, connected card. Dropping it on a
  // card (but not on one of its handles) connects to the card's facing side.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode) return
      const handleId = state.fromHandle?.id
      const fromSide = isSide(handleId) ? handleId : 'right'
      const target = (event.target as Element | null)?.closest?.('.react-flow__node')?.getAttribute('data-id')
      if (target && target !== state.fromNode.id) {
        const from = canvasRef.current.nodes.find((n) => n.id === state.fromNode!.id)
        const to = canvasRef.current.nodes.find((n) => n.id === target)
        if (from && to) commit(addEdge(canvasRef.current, { fromNode: from.id, fromSide, toNode: to.id, toSide: facingSide(to, from) }))
        return
      }
      if (target) return
      const point = screenToFlowPosition(pointerPosition(event))
      createCardAt(cardCenterAt(point, fromSide), { node: state.fromNode.id, side: fromSide })
    },
    [commit, createCardAt, screenToFlowPosition],
  )

  const onDoubleClick = (e: ReactMouseEvent) => {
    const el = e.target as Element
    if (!el.closest('.react-flow__pane') || el.closest('.react-flow__node, .react-flow__edge, .react-flow__panel')) return
    createCardAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)

  const undo = useCallback(() => {
    const prev = history.undo()
    if (prev) {
      setEditingId(null)
      commit(prev, { record: false })
    }
  }, [commit, history.undo])

  const redo = useCallback(() => {
    const next = history.redo()
    if (next) {
      setEditingId(null)
      commit(next, { record: false })
    }
  }, [commit, history.redo])

  const duplicateSelection = useCallback(() => {
    const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id)
    if (ids.length === 0) return
    const copy = duplicate(canvasRef.current, ids)
    commit(copy.canvas, { select: copy.ids })
  }, [commit])

  // Keyboard shortcuts. Typing in a card or input is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || editingId) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (mod && key === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (e.key === 'Enter' && !mod) {
        const selected = nodesRef.current.filter((n) => n.selected)
        if (selected.length === 1 && isTextNode(selected[0]!.data.node)) {
          e.preventDefault()
          setEditingId(selected[0]!.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duplicateSelection, editingId, redo, undo])

  const actions: WhiteboardActions = useMemo(
    () => ({
      editingId,
      startEditing: setEditingId,
      stopEditing: () => setEditingId(null),
      updateCard: (id: string, change: Partial<TextNode>) => commit(updateNode(canvasRef.current, id, change)),
      updateEdge: (id: string, change: Partial<CanvasEdge>) => commit(updateEdge(canvasRef.current, id, change)),
    }),
    [commit, editingId],
  )

  const setColor = (color: string | undefined) => {
    let next = canvasRef.current
    for (const n of selectedNodes) next = updateNode(next, n.id, { color })
    for (const e of selectedEdges) next = updateEdge(next, e.id, { color })
    commit(next)
  }

  const deleteSelection = () =>
    onDelete({ nodes: selectedNodes, edges: selectedEdges.filter((e) => !selectedNodes.some((n) => n.id === e.source || n.id === e.target)) })

  const hasSelection = selectedNodes.length + selectedEdges.length > 0
  const singleEdge = selectedNodes.length === 0 && selectedEdges.length === 1 ? selectedEdges[0]!.data!.edge : null
  const currentColor = [...selectedNodes.map((n) => n.data.node.color), ...selectedEdges.map((e) => e.data?.edge.color)]
  const sharedColor = currentColor.every((c) => c === currentColor[0]) ? currentColor[0] : null

  return (
    <WhiteboardContext.Provider value={actions}>
      <ReactFlow<FlowNode, FlowEdge>
        ref={flowRef}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDelete={onDelete}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={(_, node) => isTextNode(node.data.node) && setEditingId(node.id)}
        onEdgeDoubleClick={(_, edge) => setEditingId(edge.id)}
        onDoubleClick={onDoubleClick}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        selectionMode={SelectionMode.Partial}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        className={styles.flow}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <Controls showInteractive={false} />
        <MiniMap<FlowNode> pannable zoomable nodeColor={(n) => colorValue(n.data.node.color) ?? 'var(--line)'} nodeBorderRadius={4} />
        <Panel position="top-left" className={styles.toolbar}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const frame = flowRef.current?.getBoundingClientRect()
              const center = frame
                ? screenToFlowPosition({ x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 })
                : { x: 0, y: 0 }
              createCardAt(center)
            }}
          >
            + Card
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void fitView({ padding: 0.2, maxZoom: 1, duration: 250 })}>
            Zoom to fit
          </button>
          <span className={styles.sep} />
          <button type="button" className="btn btn-sm" onClick={undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="btn btn-sm" onClick={redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)">
            Redo
          </button>
          {hasSelection && (
            <>
              <span className={styles.sep} />
              <div className={styles.swatches} role="group" aria-label="Colour">
                <button
                  type="button"
                  className={`${styles.swatch} ${styles.swatchNone}`}
                  aria-pressed={sharedColor === undefined}
                  title="Default colour"
                  onClick={() => setColor(undefined)}
                />
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={styles.swatch}
                    style={{ background: `var(--canvas-${c})` }}
                    aria-pressed={sharedColor === c}
                    title={`Colour ${c}`}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              {singleEdge && <ArrowEnds edge={singleEdge} onChange={(change) => actions.updateEdge(singleEdge.id, change)} />}
              {singleEdge && (
                <button type="button" className="btn btn-sm" onClick={() => setEditingId(singleEdge.id)}>
                  {singleEdge.label ? 'Edit label' : 'Add label'}
                </button>
              )}
              {selectedNodes.length > 0 && (
                <button type="button" className="btn btn-sm" onClick={duplicateSelection} title="Duplicate (Ctrl+D)">
                  Duplicate
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={deleteSelection} title="Delete (Del)">
                Delete
              </button>
            </>
          )}
        </Panel>
        {nodes.length === 0 && (
          <Panel position="top-center" className={styles.emptyHint}>
            Double-click anywhere to add a card. Drag from a card's edge to connect it or to create a connected card.
          </Panel>
        )}
      </ReactFlow>
    </WhiteboardContext.Provider>
  )
}

const ARROW_OPTIONS = [
  { key: 'none', label: '—', title: 'No arrows', fromEnd: 'none', toEnd: 'none' },
  { key: 'forward', label: '→', title: 'Arrow at the end', fromEnd: 'none', toEnd: 'arrow' },
  { key: 'both', label: '↔', title: 'Arrows at both ends', fromEnd: 'arrow', toEnd: 'arrow' },
] as const

function ArrowEnds({ edge, onChange }: { edge: CanvasEdge; onChange: (change: Partial<CanvasEdge>) => void }) {
  const from = fromEndOf(edge)
  const to = toEndOf(edge)
  return (
    <div className={styles.segmented} role="group" aria-label="Arrows">
      {ARROW_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          title={o.title}
          aria-pressed={from === o.fromEnd && to === o.toEnd}
          // Spec defaults (no start arrow, end arrow) are written as absent fields.
          onClick={() => onChange({ fromEnd: o.fromEnd === 'none' ? undefined : 'arrow', toEnd: o.toEnd === 'arrow' ? undefined : 'none' })}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
