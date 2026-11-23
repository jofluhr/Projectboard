import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import { cardMatches, isFiltering, type CardFilter } from '../../domain/filter'
import { addCard, addColumn, isOverWip, locateCard, moveCard, moveColumn, updateColumn } from '../../domain/ops'
import type { Card, LoadedProject, Project } from '../../domain/schema'
import { useStore } from '../../state/store'
import styles from './Board.module.css'
import { BoardColumn, ColumnPreview } from './BoardColumn'
import { CardTile } from './CardTile'
import { columnIndexOf, columnSortId, columnSortIndexOf, isColumnId, isColumnSortId, numOf } from './dndIds'

/** Card numbers per column, in order. */
type Layout = number[][]

function containerOf(id: UniqueIdentifier, layout: Layout): number | null {
  if (isColumnId(id)) return columnIndexOf(id)
  const num = numOf(id)
  const index = layout.findIndex((nums) => nums.includes(num))
  return index < 0 ? null : index
}

const layoutOf = (p: Project): Layout => p.columns.map((c) => c.cards.map((card) => card.num))

/**
 * Keyboard moves: a column steps to the neighbouring column with ←/→;
 * cards use dnd-kit's sortable behaviour.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, over, collisionRect, droppableRects } = args.context
  if (!active || !isColumnSortId(active.id)) return sortableKeyboardCoordinates(event, args)
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return undefined
  event.preventDefault()
  const at = columnSortIndexOf(over && isColumnSortId(over.id) ? over.id : active.id)
  const target = droppableRects.get(columnSortId(at + (event.code === 'ArrowRight' ? 1 : -1)))
  if (!target || !collisionRect) return undefined
  return { x: target.left, y: collisionRect.top }
}

/** A dragged column only meets other columns; a dragged card only meets cards and card areas. */
const collisionDetection: CollisionDetection = (args) => {
  const columnDrag = isColumnSortId(args.active.id)
  const droppableContainers = args.droppableContainers.filter((c) => isColumnSortId(c.id) === columnDrag)
  return (columnDrag ? closestCenter : closestCorners)({ ...args, droppableContainers })
}

interface Props {
  project: LoadedProject
  filter: CardFilter
  onOpen(num: number): void
}

export function Board({ project, filter, onOpen }: Props) {
  const updateProject = useStore((s) => s.updateProject)
  const showToast = useStore((s) => s.showToast)
  const labels = useStore((s) => s.settings.labels)

  // While dragging, cards are shown in this temporary layout; the project changes on drop.
  const [dragLayout, setDragLayout] = useState<Layout | null>(null)
  const [activeNum, setActiveNum] = useState<number | null>(null)
  const [activeColumn, setActiveColumn] = useState<number | null>(null)
  const [editingColumn, setEditingColumn] = useState<number | null>(null)

  const layout = dragLayout ?? layoutOf(project)
  const cards = useMemo(
    () => new Map<number, Card>(project.columns.flatMap((c) => c.cards).map((c) => [c.num, c])),
    [project],
  )
  const filtering = isFiltering(filter)
  const visible = (card: Card) => cardMatches(card, project.key, filter)
  const update = (change: (p: Project) => Project) => updateProject(project.id, change)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Only Space starts a keyboard drag; Enter opens the card.
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
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
  const columnName = (id: UniqueIdentifier) => `column ${project.columns[columnSortIndexOf(id)]?.name ?? ''}`
  const position = (id: UniqueIdentifier | undefined) =>
    id === undefined ? 'its old place' : `position ${columnSortIndexOf(id) + 1} of ${project.columns.length}`
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      isColumnSortId(active.id) ? `Picked up ${columnName(active.id)}.` : `Picked up ${cardName(active.id)}.`,
    onDragOver: ({ active, over }) =>
      isColumnSortId(active.id)
        ? `${columnName(active.id)} is at ${position(over?.id)}.`
        : `${cardName(active.id)} is over ${placeName(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      isColumnSortId(active.id)
        ? `Moved ${columnName(active.id)} to ${position(over?.id)}.`
        : `Dropped ${cardName(active.id)} in ${placeName(over?.id)}.`,
    onDragCancel: ({ active }) =>
      `Moving ${isColumnSortId(active.id) ? columnName(active.id) : cardName(active.id)} was cancelled.`,
  }

  function onDragStart({ active }: DragStartEvent) {
    if (isColumnSortId(active.id)) {
      setActiveColumn(columnSortIndexOf(active.id))
      setEditingColumn(null)
      return
    }
    setActiveNum(numOf(active.id))
    setDragLayout(layoutOf(project))
  }

  // Moving between columns happens during the drag, so the card shows where it will land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || isColumnSortId(active.id)) return
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
    if (isColumnSortId(active.id)) {
      setActiveColumn(null)
      if (over && isColumnSortId(over.id)) {
        const from = columnSortIndexOf(active.id)
        const to = columnSortIndexOf(over.id)
        if (from !== to) update((p) => moveColumn(p, from, to))
      }
      return
    }
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
    } else if (target.done && !project.columns[start.col]!.done) {
      showToast(`${project.key}-${num} done`)
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
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragLayout(null)
        setActiveNum(null)
        setActiveColumn(null)
      }}
    >
      <div className={styles.board}>
        <SortableContext items={project.columns.map((_, i) => columnSortId(i))} strategy={horizontalListSortingStrategy}>
        {project.columns.map((column, i) => (
          <BoardColumn
            key={i}
            index={i}
            column={column}
            nums={layout[i] ?? []}
            cards={cards}
            projectKey={project.key}
            labels={labels}
            visible={visible}
            filtering={filtering}
            onOpen={onOpen}
            editing={editingColumn === i}
            onEdit={(editing) => setEditingColumn(editing ? i : null)}
            onSave={(patch) => update((p) => updateColumn(p, i, patch))}
            onAddCard={(title) => onAddCard(i, title)}
          />
        ))}
        </SortableContext>
        <button type="button" className={styles.addColumn} onClick={onAddColumn}>
          + Add column
        </button>
      </div>
      <DragOverlay>
        {activeNum !== null && cards.get(activeNum) ? (
          <CardTile card={cards.get(activeNum)!} projectKey={project.key} labels={labels} done={false} lifted />
        ) : activeColumn !== null && project.columns[activeColumn] ? (
          <ColumnPreview column={project.columns[activeColumn]!} projectKey={project.key} labels={labels} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
