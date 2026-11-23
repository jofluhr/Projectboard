import type { UniqueIdentifier } from '@dnd-kit/core'

/**
 * Ids used by dnd-kit: cards are "card:<num>", a column's card area is the droppable "col:<index>",
 * and the column itself (dragged by its header) is the sortable "colsort:<index>".
 */
export const cardDndId = (num: number) => `card:${num}`
export const columnDndId = (index: number) => `col:${index}`
export const isColumnId = (id: UniqueIdentifier) => String(id).startsWith('col:')
export const numOf = (id: UniqueIdentifier) => Number(String(id).slice('card:'.length))
export const columnIndexOf = (id: UniqueIdentifier) => Number(String(id).slice('col:'.length))
export const columnSortId = (index: number) => `colsort:${index}`
export const isColumnSortId = (id: UniqueIdentifier) => String(id).startsWith('colsort:')
export const columnSortIndexOf = (id: UniqueIdentifier) => Number(String(id).slice('colsort:'.length))
