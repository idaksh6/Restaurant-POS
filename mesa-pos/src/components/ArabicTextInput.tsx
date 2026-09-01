import { useEffect, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useI18n } from '../locale/i18n'
import { latinToArabic, suggestArabicFromLatin } from '../lib/arabicTransliterate'

export type ArabicInputMode = 'auto' | 'ar' | 'en'

type Common = {
  value: string
  onChange: (value: string) => void
  mode?: ArabicInputMode
  /** When set, fills this field from Latin source on blur if empty. */
  suggestFrom?: string
  className?: string
  label?: string
  showModeToggle?: boolean
}

type InputProps = Common &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'mode'> & {
    multiline?: false
  }

type AreaProps = Common &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
    multiline: true
  }

export type ArabicTextInputProps = InputProps | AreaProps

function resolveActive(mode: ArabicInputMode, lang: 'en' | 'ar') {
  if (mode === 'ar') return true
  if (mode === 'en') return false
  return lang === 'ar'
}

export default function ArabicTextInput(props: ArabicTextInputProps) {
  const { lang, t } = useI18n()
  const {
    value,
    onChange,
    mode = 'auto',
    suggestFrom,
    className = 'search',
    label,
    showModeToggle = true,
    multiline,
    ...rest
  } = props

  const [override, setOverride] = useState<'ar' | 'en' | null>(null)
  const arActive = override ? override === 'ar' : resolveActive(mode, lang)

  useEffect(() => {
    setOverride(null)
  }, [lang, mode])

  function handleChange(raw: string) {
    onChange(arActive ? latinToArabic(raw) : raw)
  }

  function handleBlur() {
    if (!value.trim() && suggestFrom?.trim()) {
      onChange(suggestArabicFromLatin(suggestFrom))
    }
  }

  const field = multiline ? (
    <textarea
      {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
      className={className}
      dir={arActive ? 'rtl' : undefined}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  ) : (
    <input
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      className={className}
      dir={arActive ? 'rtl' : undefined}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  )

  return (
    <div className={`mesa-ar-field${arActive ? ' is-ar' : ''}`}>
      {(label || showModeToggle) && (
        <div className="mesa-ar-field-meta">
          {label ? <span>{label}</span> : <span />}
          {showModeToggle ? (
            <button
              type="button"
              className="mesa-ar-mode"
              onClick={() => setOverride(arActive ? 'en' : 'ar')}
              title={arActive ? t.latinType : t.arabicAuto}
            >
              {arActive ? t.arabicAuto : t.latinType}
            </button>
          ) : null}
        </div>
      )}
      {field}
    </div>
  )
}
