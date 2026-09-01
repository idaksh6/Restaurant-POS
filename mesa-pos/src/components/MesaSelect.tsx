import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as KeyEv } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../locale/i18n'

export type MesaSelectOption = { value: string; label: string }

type MesaSelectProps = {
  value: string
  onChange: (value: string) => void
  options: MesaSelectOption[]
  variant?: 'field' | 'chrome'
  className?: string
  disabled?: boolean
  title?: string
  placeholder?: string
  'aria-label'?: string
}

export default function MesaSelect({
  value,
  onChange,
  options,
  variant = 'field',
  className = '',
  disabled,
  title,
  placeholder = 'Select',
  'aria-label': ariaLabel,
}: MesaSelectProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 })
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, query])

  function place() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const minW = variant === 'chrome' ? 220 : 240
    const width = Math.min(
      Math.max(r.width, minW),
      document.documentElement.clientWidth - 16,
    )
    const rtl = document.documentElement.dir === 'rtl'
    const left = rtl
      ? Math.min(Math.max(8, r.right - width), document.documentElement.clientWidth - width - 8)
      : Math.min(Math.max(8, r.left), document.documentElement.clientWidth - width - 8)
    const below = r.bottom + gap
    const menuH = Math.min(280, 52 + Math.max(filtered.length, 1) * 36)
    const top = window.innerHeight - below < menuH && r.top > menuH ? r.top - menuH - gap : below
    setPos({ top, left, width })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const selectedIdx = filtered.findIndex((o) => o.value === value)
    setActive(selectedIdx >= 0 ? selectedIdx : 0)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    place()
    setActive((i) => Math.min(i, Math.max(filtered.length - 1, 0)))
  }, [filtered, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node
      if (wrapRef.current?.contains(node) || menuRef.current?.contains(node)) return
      setOpen(false)
    }
    const onReposition = () => place()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    btnRef.current?.focus()
  }

  function pick(next: string) {
    onChange(next)
    close()
  }

  function move(delta: number) {
    if (!filtered.length) return
    setActive((i) => {
      const next = i + delta
      if (next < 0) return filtered.length - 1
      if (next >= filtered.length) return 0
      return next
    })
  }

  function onButtonKey(e: KeyEv<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setQuery('')
      setOpen(true)
      return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setQuery(e.key)
      setOpen(true)
    }
  }

  function onSearchKey(e: KeyEv<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = filtered[active]
      if (hit) pick(hit.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(filtered.length - 1, 0))
    }
  }

  const portalStyle: CSSProperties = {
    top: pos.top,
    left: pos.left,
    width: pos.width,
    minWidth: pos.width,
    maxWidth: pos.width,
    boxSizing: 'border-box',
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className={`mesa-select-menu mesa-select-menu-${variant}`}
      style={portalStyle}
    >
      <label className="mesa-select-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20 16.5 16.5" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onSearchKey}
          placeholder={t.search}
          aria-label={t.search}
          autoComplete="off"
        />
      </label>
      <ul
        id={listId}
        className="mesa-select-list"
        role="listbox"
        aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
      >
        {filtered.length === 0 ? (
          <li className="mesa-select-empty">{t.noSelectMatches}</li>
        ) : (
          filtered.map((opt, i) => (
            <li
              key={opt.value || `opt-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={opt.value === value}
            >
              <button
                type="button"
                className={`mesa-select-option${opt.value === value ? ' selected' : ''}${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  ) : null

  return (
    <div
      ref={wrapRef}
      className={`mesa-select mesa-select-${variant}${className ? ` ${className}` : ''}${open ? ' open' : ''}`}
    >
      <button
        ref={btnRef}
        type="button"
        className="mesa-select-trigger"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return
          if (open) close()
          else {
            setQuery('')
            setOpen(true)
          }
        }}
        onKeyDown={onButtonKey}
      >
        <span className="mesa-select-value">{label}</span>
        <svg className="mesa-select-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? createPortal(menu, document.body) : null}
    </div>
  )
}
