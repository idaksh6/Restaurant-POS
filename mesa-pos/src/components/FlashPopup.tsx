import { usePos } from '../state/PosContext'
import { useI18n } from '../locale/i18n'

export default function FlashPopup() {
  const { toast, toastKind, dismissFlash } = usePos()
  const { t } = useI18n()
  if (!toast) return null
  const failed = toastKind === 'err'

  return (
    <div className="flash-popup" role="alertdialog" aria-live="assertive" onClick={dismissFlash}>
      <div className={`flash-popup-card${failed ? ' err' : ' ok'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flash-popup-icon" aria-hidden>
          {failed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 8l8 8M16 8l-8 8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9" />
              <path d="M7.5 12.5 10.5 15.5 16.5 9" />
            </svg>
          )}
        </div>
        <strong>{failed ? t.failedTitle : t.successTitle}</strong>
        <p>{toast}</p>
        <button type="button" className="flash-popup-ok" onClick={dismissFlash}>
          {t.ok}
        </button>
      </div>
    </div>
  )
}
