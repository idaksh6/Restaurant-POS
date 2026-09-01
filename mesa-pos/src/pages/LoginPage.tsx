import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useI18n } from '../locale/i18n'
import { useSync } from '../sync/SyncContext'
import BrandMark from '../components/BrandMark'
import LangSwitch from '../components/LangSwitch'
import Req from '../components/Req'
import { dismissBootSplashAfterPaint } from '../lib/bootSplash'

type Field = 'username' | 'pin' | 'vat'

export default function LoginPage() {
  const { login, loginRider, companyId, selectedCompany, activateTerminal, refreshStaff } = useAuth()
  const { connectivity, recheckConnection } = useSync()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const riderMode = location.pathname.startsWith('/rider')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [taxId, setTaxId] = useState('')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({})
  const [busy, setBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const userRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const vatRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dismissBootSplashAfterPaint()
  }, [])

  const bound = Boolean(companyId)
  const brandEn = selectedCompany?.companyName || t.appName
  const brandAr = selectedCompany?.aliasName || selectedCompany?.companyName || t.appName

  function clearAlerts() {
    setError('')
    setInvalid({})
  }

  function press(digit: string) {
    setError('')
    setInvalid((prev) => ({ ...prev, pin: undefined }))
    setPin((prev) => (prev.length >= (riderMode ? 4 : 64) ? prev : prev + digit))
  }

  function clearPin() {
    setPin('')
    setInvalid((prev) => ({ ...prev, pin: undefined }))
    setError('')
    pinRef.current?.focus()
  }

  function validateSignIn() {
    const next: Partial<Record<Field, string>> = {}
    if (!riderMode && !username.trim()) next.username = t.enterUsername
    if (!pin) next.pin = riderMode ? 'Enter last 4 digits of your phone' : t.enterPinOrPassword
    setInvalid(next)
    if (next.username) {
      setError(next.username)
      userRef.current?.focus()
      return false
    }
    if (next.pin) {
      setError(next.pin)
      pinRef.current?.focus()
      return false
    }
    return true
  }

  async function submit() {
    if (busy) return
    if (!validateSignIn()) return
    setBusy(true)
    clearAlerts()
    try {
      if (riderMode) {
        const ok = await loginRider(pin)
        if (!ok) {
          setError('Wrong rider PIN. Use last 4 digits of the phone in Settings → Delivery boy.')
          setInvalid({ pin: 'Wrong rider PIN' })
          setPin('')
          pinRef.current?.focus()
        } else {
          navigate('/rider', { replace: true })
        }
        return
      }
      const ok = await login(username, pin)
      if (ok === 'inactive') {
        setError(t.userInactiveLogin)
        setInvalid({ username: t.userInactiveLogin })
        setPin('')
        pinRef.current?.focus()
      } else if (!ok) {
        setError(t.wrongCredentials)
        setInvalid({ username: t.wrongCredentials, pin: t.wrongCredentials })
        setPin('')
        pinRef.current?.focus()
      } else {
        navigate('/', { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const vat = taxId.trim()
    if (!vat) {
      setInvalid({ vat: t.enterVat })
      setError(t.enterVat)
      vatRef.current?.focus()
      return
    }
    if (vat.replace(/\s/g, '').length < 10) {
      setInvalid({ vat: t.vatTooShort })
      setError(t.vatTooShort)
      vatRef.current?.focus()
      return
    }
    setBusy(true)
    clearAlerts()
    try {
      await activateTerminal(vat)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.activateFailed
      setError(message)
      setInvalid({ vat: message })
      vatRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function onRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setNotice('')
    setError('')
    try {
      const connected = await recheckConnection()
      const staffOk = await refreshStaff()
      if (connected && staffOk) setNotice(t.refreshOk)
      else {
        setError(t.refreshOffline)
        setInvalid({})
      }
    } catch {
      setError(t.refreshOffline)
    } finally {
      setRefreshing(false)
    }
  }

  const modeLabel = connectivity === 'offline' ? t.offline : connectivity === 'syncing' ? t.syncing : t.online

  const toolbar = (
    <div className="login-toolbar">
      <span className={`login-status mesa-sync-chip ${connectivity}`}>
        <span className="mesa-sync-dot" aria-hidden />
        {modeLabel}
      </span>
      <button type="button" className="login-toolbar-btn" disabled={refreshing} onClick={() => void onRefresh()}>
        {refreshing ? t.refreshing : t.refresh}
      </button>
      <LangSwitch variant="field" />
    </div>
  )

  return (
    <div className="login-screen">
      <div className="login-wrap login-wrap-narrow">
        <header className="login-top">
          <div className="login-top-brand">
            <BrandMark name={lang === 'ar' ? brandAr : brandEn} />
            <div>
              <strong>{lang === 'ar' ? brandAr : brandEn}</strong>
              <span>{lang === 'ar' ? brandEn : brandAr}</span>
            </div>
          </div>
        </header>

        {!bound ? (
          <form className="login-panel login-panel-lift" onSubmit={(e) => void activate(e)} noValidate>
            {toolbar}
            <div className="login-panel-head">
              <h1>{t.chooseCompany}</h1>
              <p>{t.activateHint}</p>
            </div>
            {error ? (
              <p className="login-alert" role="alert">
                {error}
              </p>
            ) : notice ? (
              <p className="login-notice" role="status">
                {notice}
              </p>
            ) : null}
            <label className={`login-field${invalid.vat ? ' invalid' : ''}`}>
              <span>{t.vatTaxId}</span>
              <input
                ref={vatRef}
                className="login-secret mesa-ltr-nums"
                value={taxId}
                onChange={(e) => {
                  clearAlerts()
                  setTaxId(e.target.value)
                }}
                placeholder="3xxxxxxxxxxxxxxx003"
                autoComplete="off"
                inputMode="numeric"
                aria-invalid={Boolean(invalid.vat)}
                aria-describedby={invalid.vat ? 'login-vat-err' : undefined}
              />
              {invalid.vat ? (
                <em id="login-vat-err" className="login-field-msg">
                  {invalid.vat}
                </em>
              ) : null}
            </label>
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? t.activating : t.activatePos}
            </button>
            <p className="login-foot">
              {t.installerOnly} · <Link to="/developer">{t.developerPortal}</Link>
            </p>
          </form>
        ) : (
          <section className="login-panel login-panel-lift">
            {toolbar}
            <div className="login-panel-head">
              <h1>{riderMode ? 'Rider sign-in' : t.signInTitle}</h1>
              <p>
                {riderMode
                  ? 'Enter the last 4 digits of your phone (Settings → Delivery boy). Not a staff username.'
                  : t.signInHint}
              </p>
            </div>
            {error ? (
              <p className="login-alert" role="alert">
                {error}
              </p>
            ) : notice ? (
              <p className="login-notice" role="status">
                {notice}
              </p>
            ) : null}
            {!riderMode ? (
              <label className={`login-field${invalid.username ? ' invalid' : ''}`}>
                <span>
                  {t.username} <Req />
                </span>
                <input
                  ref={userRef}
                  className="login-secret"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  placeholder={t.username}
                  aria-invalid={Boolean(invalid.username)}
                  aria-describedby={invalid.username ? 'login-user-err' : undefined}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setInvalid((prev) => ({ ...prev, username: undefined }))
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pinRef.current?.focus()
                  }}
                />
                {invalid.username ? (
                  <em id="login-user-err" className="login-field-msg">
                    {invalid.username}
                  </em>
                ) : null}
              </label>
            ) : null}
            <label className={`login-field${invalid.pin ? ' invalid' : ''}`}>
              <span>
                {riderMode ? 'Phone PIN (last 4)' : t.enterPin} <Req />
              </span>
              <div className="login-pin-wrap">
                <input
                  ref={pinRef}
                  className="login-secret"
                  type={showPin ? 'text' : 'password'}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={pin}
                  maxLength={riderMode ? 4 : 64}
                  placeholder={riderMode ? '••••' : t.enterPin}
                  aria-invalid={Boolean(invalid.pin)}
                  aria-describedby={invalid.pin ? 'login-pin-err' : undefined}
                  onChange={(e) => {
                    setPin(riderMode ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)
                    setInvalid((prev) => ({ ...prev, pin: undefined }))
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                />
                <button
                  type="button"
                  className="login-pin-toggle"
                  onClick={() => setShowPin((v) => !v)}
                  aria-pressed={showPin}
                >
                  {showPin ? t.hidePin : t.showPin}
                </button>
              </div>
              {invalid.pin ? (
                <em id="login-pin-err" className="login-field-msg">
                  {invalid.pin}
                </em>
              ) : null}
            </label>

            {riderMode ? (
              <p className="login-foot" style={{ marginTop: 0 }}>
                Add riders under Settings → Delivery boy. Staff till:{' '}
                <Link to="/">Sign in as staff</Link>
              </p>
            ) : null}

            <div className="pin-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`pin-key${key === 'OK' ? ' ok' : ''}${key === 'C' ? ' clear' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    if (key === 'C') clearPin()
                    else if (key === 'OK') void submit()
                    else press(key)
                  }}
                >
                  {key === 'OK' && busy ? '…' : key === 'C' ? t.clear : key}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
