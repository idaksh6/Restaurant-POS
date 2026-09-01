import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../locale/i18n'
import {
  backspaceFocusedField,
  insertIntoFocusedField,
} from '../lib/onScreenKeyboard'

const ROW1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROW2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const ROW3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']
const ROW4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

type Props = {
  open: boolean
  onClose: () => void
}

export default function VirtualKeyboard({ open, onClose }: Props) {
  const { t, lang } = useI18n()
  const [shift, setShift] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function press(ch: string) {
    insertIntoFocusedField(shift ? ch.toUpperCase() : ch)
    if (shift) setShift(false)
  }

  function keepFocus(e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function onEnter() {
    const el = document.activeElement
    if (el instanceof HTMLTextAreaElement) {
      insertIntoFocusedField('\n')
      return
    }
    if (el instanceof HTMLInputElement) {
      el.form?.requestSubmit?.()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }
    onClose()
  }

  const node = (
    <div className="mesa-vkb" role="dialog" aria-label={t.keyboard}>
      <div className="mesa-vkb-bar">
        <strong>{t.keyboard}</strong>
        <span className="mesa-vkb-hint">
          {lang === 'ar' ? 'اضغط حقل الإدخال ثم اكتب' : 'Tap a field, then type'}
        </span>
        <button type="button" className="mesa-vkb-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="mesa-vkb-rows" onMouseDown={keepFocus} onPointerDown={keepFocus}>
        <div className="mesa-vkb-row">
          {ROW1.map((k) => (
            <button key={k} type="button" className="mesa-vkb-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
        </div>
        <div className="mesa-vkb-row">
          {ROW2.map((k) => (
            <button
              key={k}
              type="button"
              className="mesa-vkb-key"
              onClick={() => press(k)}
            >
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
        </div>
        <div className="mesa-vkb-row">
          <span className="mesa-vkb-spacer" />
          {ROW3.map((k) => (
            <button
              key={k}
              type="button"
              className="mesa-vkb-key"
              onClick={() => press(k)}
            >
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
          <span className="mesa-vkb-spacer" />
        </div>
        <div className="mesa-vkb-row">
          <button
            type="button"
            className={`mesa-vkb-key mesa-vkb-mod${shift ? ' active' : ''}`}
            onClick={() => setShift((v) => !v)}
          >
            ⇧
          </button>
          {ROW4.map((k) => (
            <button
              key={k}
              type="button"
              className="mesa-vkb-key"
              onClick={() => press(k)}
            >
              {shift ? k.toUpperCase() : k}
            </button>
          ))}
          <button
            type="button"
            className="mesa-vkb-key mesa-vkb-mod"
            onClick={() => backspaceFocusedField()}
          >
            ⌫
          </button>
        </div>
        <div className="mesa-vkb-row">
          <button
            type="button"
            className="mesa-vkb-key mesa-vkb-mod"
            onClick={() => press('-')}
          >
            -
          </button>
          <button
            type="button"
            className="mesa-vkb-key mesa-vkb-mod"
            onClick={() => press('@')}
          >
            @
          </button>
          <button
            type="button"
            className="mesa-vkb-key mesa-vkb-space"
            onClick={() => press(' ')}
          >
            {lang === 'ar' ? 'مسافة' : 'Space'}
          </button>
          <button
            type="button"
            className="mesa-vkb-key mesa-vkb-mod"
            onClick={() => press('.')}
          >
            .
          </button>
          <button type="button" className="mesa-vkb-key mesa-vkb-enter" onClick={onEnter}>
            Enter
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
