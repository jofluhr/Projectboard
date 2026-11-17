import type { UniqueIdentifier } from '@dnd-kit/core'

/** Ids used by dnd-kit: cards are "card:<num>", columns "col:<index>". */
export const cardDndId = (num: number) => `card:${num}`
export const columnDndId = (index: number) => `col:${index}`
export const isColumnId = (id: UniqueIdentifier) => String(id).startsWith('col:')
export const numOf = (id: UniqueIdentifier) => Number(String(id).slice('card:'.length))
export const columnIndexOf = (id: UniqueIdentifier) => Number(String(id).slice('col:'.length))
