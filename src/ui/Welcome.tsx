import { useStore } from '../state/store'
import styles from './Welcome.module.css'

export function Welcome() {
  const status = useStore((s) => s.status)
  const pickFolder = useStore((s) => s.pickFolder)
  const grantPermission = useStore((s) => s.grantPermission)

  if (status.kind === 'loading') return <div className={styles.loading}>Loading…</div>

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>Projectboard</div>

        {status.kind === 'unsupported' && (
          <>
            <h1>Open Projectboard in Edge or Chrome</h1>
            <p>
              Projectboard keeps your boards as plain files in a folder on your PC. Only Chromium-based browsers
              (Microsoft Edge, Google Chrome) let a web app read and write a folder. Firefox and Safari do not.
            </p>
            <ol>
              <li>Open this page in Microsoft Edge.</li>
              <li>Click the install icon in the address bar (or menu → Apps → Install this site as an app).</li>
              <li>Start Projectboard from the Start menu. It runs in its own window.</li>
            </ol>
            <p className={styles.url}>
              Address: <span className="mono">{location.href}</span>
            </p>
          </>
        )}

        {status.kind === 'no-folder' && (
          <>
            <h1>Choose a data folder</h1>
            <p>
              Your projects are saved as plain files in a folder you pick. Nothing is uploaded. If the folder is empty,
              Projectboard creates a starter project, an inbox and a short README there.
            </p>
            <p className={styles.hint}>
              Tip: use a new folder outside any code repository, for example in Documents.
            </p>
            <button className="btn btn-primary" type="button" onClick={() => void pickFolder()}>
              Choose folder
            </button>
          </>
        )}

        {status.kind === 'needs-permission' && (
          <>
            <h1>Allow access to “{status.folderName}”</h1>
            <p>The browser asks again after a restart before Projectboard may read and write your data folder.</p>
            <div className={styles.row}>
              <button className="btn btn-primary" type="button" onClick={() => void grantPermission()}>
                Allow access
              </button>
              <button className="btn" type="button" onClick={() => void pickFolder()}>
                Choose another folder
              </button>
            </div>
          </>
        )}

        {status.kind === 'error' && (
          <>
            <h1>The data folder could not be opened</h1>
            <p className={styles.error}>{status.message}</p>
            <button className="btn btn-primary" type="button" onClick={() => void pickFolder()}>
              Choose a folder
            </button>
          </>
        )}
      </div>
    </div>
  )
}
