import { useEffect, useState, type KeyboardEvent } from 'react'

type Props = {
  value: number
  onChange: (delta: number) => void
  min?: number
  max?: number
  disabled?: boolean
  minusDisabled?: boolean
  plusDisabled?: boolean
  inputDisabled?: boolean
  className?: string
  inputClassName?: string
  ariaLabel?: string
}

function digitsOnly(raw: string) {
  return raw.replace(/\D/g, '')
}

export default function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  disabled = false,
  minusDisabled,
  plusDisabled,
  inputDisabled,
  className,
  inputClassName,
  ariaLabel = 'Quantity',
}: Props) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  function commit() {
    setEditing(false)
    const cleaned = digitsOnly(draft)
    if (!cleaned) {
      setDraft(String(value))
      return
    }
    const parsed = Number(cleaned)
    const clamped = Math.max(min, Math.min(max, parsed))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped - value)
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      e.currentTarget.blur()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(String(value))
      setEditing(false)
      e.currentTarget.blur()
    }
  }

  const minusOff = disabled || minusDisabled || value <= min
  const plusOff = disabled || plusDisabled || value >= max
  const inputOff = disabled || inputDisabled

  return (
    <div className={`qty-controls${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={minusOff}
        onClick={() => onChange(-1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={`qty-input${inputClassName ? ` ${inputClassName}` : ''}`}
        value={draft}
        disabled={inputOff}
        aria-label={ariaLabel}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onBlur={commit}
        onKeyDown={onInputKeyDown}
        onChange={(e) => setDraft(digitsOnly(e.target.value))}
      />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={plusOff}
        onClick={() => onChange(1)}
      >
        +
      </button>
    </div>
  )
}
