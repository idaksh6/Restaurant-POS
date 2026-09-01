import { useI18n } from '../locale/i18n'

export default function LangSwitch({ variant = 'chrome' }: { variant?: 'chrome' | 'field' }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={`mesa-lang-switch mesa-lang-${variant}`} role="group" aria-label={t.languageGroup}>
      <button
        type="button"
        className={lang === 'en' ? 'on' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === 'ar' ? 'on' : ''}
        aria-pressed={lang === 'ar'}
        onClick={() => setLang('ar')}
      >
        عربي
      </button>
    </div>
  )
}
