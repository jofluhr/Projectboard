import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import { addCard, addColumn, isOverWip, locateCard, moveCard, updateColumn } from '../../domain/ops'
import type { Card, LoadedProject, Project } from '../../domain/schema'
import { useStore } from '../../state/store'
import styles from './Board.module.css'
import { BoardColumn } from './BoardColumn'
import { CardTile } from './CardTile'
import { columnIndexOf, isColumnId, numOf } from './dndIds'


/** Card numbers per column, in order. */
type Layout = number[][]

function containerOf(id: UniqueIdentifier, layout: Layout): number | null {
  if (isColumnId(id)) return columnIndexOf(id)
  const num = numOf(id)
  const index = layout.findIndex((nums) => nums.includes(num))
  return index < 0 ? null : index
}

const layoutOf = (p: Project): Layout => p.columns.map((c) => c.cards.map((card) => card.num))

export function Board({ project }: { project: LoadedProject }) {
  const updateProject = useStore((s) => s.updateProject)
  const showToast = useStore((s) => s.showToast)
  const labels = useStore((s) => s.settings.labels)

  // While dragging, cards are shown in this temporary layout; the project changes on drop.
  const [dragLayout, setDragLayout] = useState<Layout | null>(null)
  const [activeNum, setActiveNum] = useState<number | null>(null)
  const [editingColumn, setEditingColumn] = useState<number | null>(null)

  const layout = dragLayout ?? layoutOf(project)
  const cards = useMemo(
    () => new Map<number, Card>(project.columns.flatMap((c) => c.cards).map((c) => [c.num, c])),
    [project],
  )
  const update = (change: (p: Project) => Project) => updateProject(project.id, change)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const cardName = (id: UniqueIdentifier) => {
    const card = cards.get(numOf(id))
    return card ? `${project.key}-${card.num} “${card.title}”` : 'card'
  }
  const placeName = (id: UniqueIdentifier | undefined) => {
    if (id === undefined || !dragLayout) return 'nowhere'
    const col = containerOf(id, dragLayout)
    return col === null ? 'nowhere' : `column ${project.columns[col]?.name ?? ''}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${cardName(active.id)}.`,
    onDragOver: ({ active, over }) => `${cardName(active.id)} is over ${placeName(over?.id)}.`,
    onDragEnd: ({ active, over }) => `Dropped ${cardName(active.id)} in ${placeName(over?.id)}.`,
    onDragCancel: ({ active }) => `Moving ${cardName(active.id)} was cancelled.`,
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveNum(numOf(active.id))
    setDragLayout(layoutOf(project))
  }

  // Moving between columns happens during the drag, so the card shows where it will land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    setDragLayout((prev) => {
      if (!prev) return prev
      const from = containerOf(active.id, prev)
      const to = containerOf(over.id, prev)
      if (from === null || to === null || from === to) return prev
      const num = numOf(active.id)
      const next = prev.map((nums) => nums.filter((n) => n !== num))
      const target = next[to]!
      const overIndex = isColumnId(over.id) ? -1 : target.indexOf(numOf(over.id))
      target.splice(overIndex < 0 ? target.length : overIndex, 0, num)
      return next
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const finalLayout = dragLayout
    setDragLayout(null)
    setActiveNum(null)
    if (!over || !finalLayout) return

    const num = numOf(active.id)
    const toCol = containerOf(over.id, finalLayout)
    if (toCol === null) return
    let column = finalLayout[toCol]!
    if (!isColumnId(over.id)) {
      const from = column.indexOf(num)
      const to = column.indexOf(numOf(over.id))
      if (from >= 0 && to >= 0 && from !== to) column = arrayMove(column, from, to)
    }
    const toIndex = column.indexOf(num)
    const start = locateCard(project, num)
    if (toIndex < 0 || !start || (start.col === toCol && start.index === toIndex)) return

    update((p) => moveCard(p, num, toCol, toIndex, new Date()))
    const target = project.columns[toCol]!
    if (start.col !== toCol && isOverWip(target, column.length)) {
      showToast(`${target.name} is over its WIP limit (${column.length}/${target.wipLimit}).`)
    }
  }

  function onAddCard(colIndex: number, title: string) {
    update((p) => addCard(p, colIndex, title, new Date()))
    const col = project.columns[colIndex]!
    if (isOverWip(col, col.cards.length + 1)) {
      showToast(`${col.name} is over its WIP limit (${col.cards.length + 1}/${col.wipLimit}).`)
    }
  }

  function onAddColumn() {
    const { index } = addColumn(project, 'New column')
    update((p) => addColumn(p, 'New column').project)
    setEditingColumn(index)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragLayout(null)
        setActiveNum(null)
      }}
    >
      <div className={styles.board}>
        {project.columns.map((column, i) => (
          <BoardColumn
            key={i}
            index={i}
            column={column}
            nums={layout[i] ?? []}
            cards={cards}
            projectKey={project.key}
            labels={labels}
            editing={editingColumn === i}
            onEdit={(editing) => setEditingColumn(editing ? i : null)}
            onSave={(patch) => update((p) => updateColumn(p, i, patch))}
            onAddCard={(title) => onAddCard(i, title)}
          />
        ))}
        <button type="button" className={styles.addColumn} onClick={onAddColumn}>
          + Add column
        </button>
      </div>
      <DragOverlay>
        {activeNum !== null && cards.get(activeNum) ? (
          <CardTile card={cards.get(activeNum)!} projectKey={project.key} labels={labels} done={false} lifted />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
