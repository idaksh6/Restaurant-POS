import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title?: string
  message: string
  okLabel?: string
  onClose: () => void
}

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 9.5 17 19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function SuccessModal({
  title = 'Success',
  message,
  okLabel = 'OK',
  onClose,
}: Props) {
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    okRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="modal-backdrop mesa-confirm-backdrop mesa-success-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mesa-success-title"
      aria-describedby="mesa-success-msg"
      onClick={onClose}
    >
      <div className="zk-confirm-card mesa-success-card" onClick={(e) => e.stopPropagation()}>
        <div className="mesa-success-icon" aria-hidden>
          <IconCheck />
        </div>
        <div className="mesa-success-copy">
          <h2 id="mesa-success-title" className="mesa-success-title">
            {title}
          </h2>
          <p id="mesa-success-msg" className="mesa-success-msg">
            {message}
          </p>
        </div>
        <div className="zk-confirm-actions mesa-success-actions">
          <button
            ref={okRef}
            type="button"
            className="zk-confirm-btn primary"
            onClick={onClose}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
