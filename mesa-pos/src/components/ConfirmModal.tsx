import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep',
  danger = false,
  onClose,
  onConfirm,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="modal-backdrop mesa-confirm-backdrop"
      role="alertdialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="zk-confirm-card mesa-confirm-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="zk-confirm-head">{title}</div>
        <p className="zk-confirm-msg">{message}</p>
        <div className="zk-confirm-actions">
          <button type="button" className="zk-confirm-btn" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`zk-confirm-btn primary${danger ? ' danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
