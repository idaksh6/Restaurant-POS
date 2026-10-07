import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePos } from '../state/PosContext'
import { useI18n } from '../locale/i18n'

export default function FlashPopup() {
  const { toast, toastKind, dismissFlash } = usePos()
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<'ok' | 'err'>('ok')

  useEffect(() => {
    if (toast) {
      setMessage(toast)
      setKind(toastKind === 'err' ? 'err' : 'ok')
      setLeaving(false)
      setVisible(true)
      return
    }
    if (!visible) return
    setLeaving(true)
    const id = window.setTimeout(() => {
      setVisible(false)
      setLeaving(false)
      setMessage('')
    }, 220)
    return () => window.clearTimeout(id)
  }, [toast, toastKind, visible])

  if (!visible || !message) return null

  const failed = kind === 'err'

  return createPortal(
    <div
      className={`flash-toast-host${leaving ? ' hide' : ' show'}`}
      aria-live={failed ? 'assertive' : 'polite'}
    >
      <div
        className={`flash-toast${failed ? ' err' : ' ok'}`}
        role={failed ? 'alert' : 'status'}
        onClick={dismissFlash}
      >
        <div className="flash-toast-icon" aria-hidden>
          {failed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M8 8l8 8M16 8l-8 8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 12.5 10.2 16 17.5 8.5" />
            </svg>
          )}
        </div>
        <div className="flash-toast-copy">
          <p className="flash-toast-kicker">{failed ? t.failedTitle : 'Done'}</p>
          <strong>{message}</strong>
        </div>
        <button
          type="button"
          className="flash-toast-close"
          aria-label={t.close}
          onClick={(e) => {
            e.stopPropagation()
            dismissFlash()
          }}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )
}
