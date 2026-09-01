import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  label?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: (value: string) => void
}

export default function TextPromptModal({
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function submit() {
    onConfirm(value.trim())
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-card text-prompt-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') submit()
        }}
      >
        <div className="dine-pick-head">
          <h2>{title}</h2>
          <button type="button" className="dine-ticket-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {label ? <label className="field-label">{label}</label> : null}
        <input
          ref={inputRef}
          className="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="text-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-teal" onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
