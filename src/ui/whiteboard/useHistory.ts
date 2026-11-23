import { useCallback, useRef, useState } from 'react'

const LIMIT = 100

/** Undo/redo over whole snapshots. Lives in memory only and starts empty for each board. */
export function useHistory<T>(initial: T) {
  const stack = useRef<T[]>([initial])
  const index = useRef(0)
  // Bumped on every change so buttons re-render with the right enabled state.
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  const push = useCallback((snapshot: T) => {
    stack.current = [...stack.current.slice(0, index.current + 1), snapshot].slice(-LIMIT - 1)
    index.current = stack.current.length - 1
    bump()
  }, [])

  const undo = useCallback((): T | undefined => {
    if (index.current === 0) return undefined
    index.current--
    bump()
    return stack.current[index.current]
  }, [])

  const redo = useCallback((): T | undefined => {
    if (index.current >= stack.current.length - 1) return undefined
    index.current++
    bump()
    return stack.current[index.current]
  }, [])

  const reset = useCallback((snapshot: T) => {
    stack.current = [snapshot]
    index.current = 0
    bump()
  }, [])

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: index.current > 0,
    canRedo: index.current < stack.current.length - 1,
  }
}
