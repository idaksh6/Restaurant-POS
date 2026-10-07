import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import {
  getCardTerminalStatus,
  requestCardPayment,
  setCardTerminalSimulateEnabled,
  type CardPayResult,
} from '../hardware/cardTerminal'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

export default function CardTerminalPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { flash } = usePos()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [status, setStatus] = useState(() => getCardTerminalStatus())
  const [testing, setTesting] = useState(false)
  const [lastTest, setLastTest] = useState<CardPayResult | null>(null)

  const refresh = useCallback(() => {
    setStatus(getCardTerminalStatus())
  }, [])

  useEffect(() => {
    if (!canAccess) return
    refresh()
    const onFocus = () => refresh()
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setInterval(refresh, 4000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(timer)
    }
  }, [canAccess, refresh])

  function toggleSimulate() {
    if (status.bridgePresent) return
    const next = !status.simulateEnabled
    setCardTerminalSimulateEnabled(next)
    refresh()
    flash(next ? t.softposSimulateOn : t.softposSimulateOff)
  }

  async function runTestPay() {
    if (testing) return
    setTesting(true)
    setLastTest(null)
    try {
      const result = await requestCardPayment({
        amountSar: 1,
        currency: 'SAR',
        reference: `TEST-${Date.now()}`,
      })
      setLastTest(result)
      refresh()
      if (result.ok) {
        flash(
          t.softposTestOk
            .replace('{auth}', result.authCode)
            .replace('{rrn}', result.rrn),
        )
      } else {
        flash(result.reason || t.softposTestFail)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t.softposTestFail
      setLastTest({ ok: false, reason: message })
      flash(message)
    } finally {
      setTesting(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="zk-company zk-softpos">
        <HubHeader closeTo={settingsHubPath('settings')} />
        <div className="zk-company-body zk-softpos-body">
          <div className="zk-softpos-card zk-softpos-locked">
            <strong>{t.lock}</strong>
            <p>{t.softposLocked}</p>
            <Link to={settingsHubPath('settings')} className="zk-co-btn">
              {t.backToSettings}
            </Link>
          </div>
        </div>
        <HubFooter backTo={settingsHubPath('settings')} />
      </div>
    )
  }

  const statusTone = status.bridgePresent
    ? 'ok'
    : status.simulateEnabled
      ? 'warn'
      : 'danger'

  return (
    <div className="zk-company zk-softpos">
      <HubHeader closeTo={settingsHubPath('settings')} />

      <div className="zk-company-body zk-softpos-body">
        <header className="zk-co-pagehead zk-softpos-pagehead">
          <div>
            <h1>{t.softposTitle}</h1>
            <p>{t.softposHint}</p>
          </div>
        </header>

        <section className="zk-softpos-card">
          <div className="zk-softpos-status-grid">
            <div className="zk-softpos-stat">
              <span>{t.softposStatus}</span>
              <strong className={`zk-softpos-pill ${statusTone}`}>{status.label}</strong>
            </div>
            <div className="zk-softpos-stat">
              <span>{t.softposBridge}</span>
              <strong className={status.bridgePresent ? 'mesa-ok' : 'mesa-warn'}>
                {status.bridgePresent ? t.softposBridgePresent : t.softposBridgeMissing}
              </strong>
            </div>
            <div className="zk-softpos-stat zk-softpos-stat-switch">
              <span>{t.softposSimulate}</span>
              <button
                type="button"
                role="switch"
                aria-checked={status.simulateEnabled}
                className={`zk-user-switch${status.simulateEnabled ? ' on' : ''}`}
                onClick={toggleSimulate}
                disabled={status.bridgePresent}
                title={
                  status.bridgePresent ? t.softposSimulateDisabledBridge : t.softposSimulate
                }
              >
                <i aria-hidden />
                <strong>{status.simulateEnabled ? t.onLabel : t.offLabel}</strong>
              </button>
            </div>
          </div>

          <p className="zk-softpos-note">{t.softposNote}</p>
          <p className="zk-softpos-note zk-softpos-desktop-hint">{t.softposDesktopHint}</p>

          <div className="zk-softpos-actions">
            <button type="button" className="zk-co-btn" onClick={refresh}>
              {t.softposRefresh}
            </button>
            <button
              type="button"
              className="zk-co-btn primary"
              onClick={() => void runTestPay()}
              disabled={testing || (!status.bridgePresent && !status.simulateEnabled)}
            >
              {testing ? t.softposTesting : t.softposTestPay}
            </button>
          </div>

          {lastTest ? (
            <div
              className={`zk-softpos-test-result ${lastTest.ok ? 'ok' : 'fail'}`}
              role="status"
            >
              {lastTest.ok ? (
                <>
                  <strong>{t.softposTestOkTitle}</strong>
                  <span>
                    Auth {lastTest.authCode}
                    {lastTest.offline ? ` · ${t.softposOffline}` : ''}
                  </span>
                  <span>RRN {lastTest.rrn}</span>
                </>
              ) : (
                <>
                  <strong>{t.softposTestFailTitle}</strong>
                  <span>{lastTest.reason}</span>
                </>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <HubFooter backTo={settingsHubPath('settings')} />
    </div>
  )
}
