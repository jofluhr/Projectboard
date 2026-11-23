import { useState } from 'react'
import { NO_FILTER, type CardFilter } from '../../domain/filter'
import type { LoadedProject } from '../../domain/schema'
import { Board } from './Board'
import styles from './Board.module.css'
import { BoardToolbar, type ViewMode } from './BoardToolbar'
import { CardDialog } from './CardDialog'
import { CardList } from './CardList'

/** Toolbar, board or list, and the card dialog of one project. Remounted on project switch, which resets filters. */
export function ProjectView({ project }: { project: LoadedProject }) {
  const [filter, setFilter] = useState<CardFilter>(NO_FILTER)
  const [view, setView] = useState<ViewMode>('board')
  const [openNum, setOpenNum] = useState<number | null>(null)

  const close = () => {
    const num = openNum
    setOpenNum(null)
    // Give focus back to the card the dialog was opened from.
    if (num !== null) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card-num="${num}"]`)?.focus())
  }

  return (
    <div className={styles.projectView}>
      <BoardToolbar filter={filter} onFilter={setFilter} view={view} onView={setView} />
      <div className={styles.viewArea}>
        {view === 'board' ? (
          <Board project={project} filter={filter} onOpen={setOpenNum} />
        ) : (
          <CardList project={project} filter={filter} onOpen={setOpenNum} />
        )}
      </div>
      {openNum !== null && <CardDialog key={openNum} project={project} num={openNum} onClose={close} />}
    </div>
  )
}
