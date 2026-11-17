import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import styles from './Toast.module.css'

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), Math.max(3000, toast.text.length * 60))
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div className={`${styles.toast} ${visible ? styles.show : ''}`} role="status" aria-live="polite">
      {toast?.text}
    </div>
  )
}
