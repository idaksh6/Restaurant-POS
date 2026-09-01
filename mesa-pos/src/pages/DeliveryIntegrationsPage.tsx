import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import {
  clearNotifyLog,
  loadDeliveryIntegrations,
  loadNotifyLog,
  posApiBaseUrl,
  saveDeliveryIntegrations,
  type ChannelIntegration,
  type DeliveryIntegrationsConfig,
  type DeliveryNotifyEvent,
} from '../data/deliveryIntegrations'
import { envApiBaseUrl, setApiBaseUrlOverride } from '../lib/apiBase'
import {
  apiListChannelConfigs,
  apiSyncChannelMenu,
  apiUpsertChannelConfig,
  type ChannelConfigRow,
} from '../lib/apiDeliveryChannels'
import { apiMastersReady } from '../lib/apiMasters'
import { resolveDeliveryChannel } from '../lib/ksaDelivery'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

type Section = 'connection' | 'channels' | 'alerts'

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export default function DeliveryIntegrationsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { activeBranchId } = useBranch()
  const { recheckConnection, runSync } = useSync()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const notifyMode =
    location.pathname.includes('/settings/notifications') ||
    searchParams.get('focus') === 'alerts' ||
    searchParams.get('focus') === 'notify'
  const [section, setSection] = useState<Section>(() => (notifyMode ? 'alerts' : 'connection'))
  const [cfg, setCfg] = useState<DeliveryIntegrationsConfig>(() => loadDeliveryIntegrations())
  const [apiDraft, setApiDraft] = useState(() => posApiBaseUrl())
  const [log, setLog] = useState<DeliveryNotifyEvent[]>(() => loadNotifyLog())
  const [showSample, setShowSample] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncBusy, setSyncBusy] = useState<string | null>(null)
  const [serverConfigs, setServerConfigs] = useState<ChannelConfigRow[]>([])

  useEffect(() => {
    if (!notifyMode) return
    setSection('alerts')
    setLog(loadNotifyLog())
  }, [notifyMode])

  useEffect(() => {
    if (!apiMastersReady() || !activeBranchId) return
    void apiListChannelConfigs(activeBranchId)
      .then((rows) => {
        setServerConfigs(rows)
        if (!rows.length) return
        setCfg((prev) => {
          const byId = new Map(rows.map((r) => [r.channelId, r]))
          return {
            ...prev,
            channels: prev.channels.map((c) => {
              const remote = byId.get(c.channelId)
              if (!remote) return c
              return {
                ...c,
                enabled: remote.enabled,
                storeId: remote.storeId ?? c.storeId,
                apiKey: remote.apiKey ?? c.apiKey,
                apiBaseUrl: remote.apiBaseUrl ?? c.apiBaseUrl,
                webhookSecret: remote.webhookSecret ?? c.webhookSecret,
              }
            }),
          }
        })
      })
      .catch(() => undefined)
  }, [activeBranchId])

  const webhookUrl = useMemo(() => {
    const base = apiDraft.trim().replace(/\/$/, '')
    return base ? `${base}/webhooks/delivery/ingest` : ''
  }, [apiDraft])

  const envDefault = envApiBaseUrl()
  const sections: Array<{ id: Section; label: string; hint: string }> = [
    { id: 'connection', label: 'Connection', hint: 'API server & webhook' },
    { id: 'channels', label: 'Channels', hint: 'HungerStation, Jahez…' },
    { id: 'alerts', label: 'Alerts', hint: 'SMS / WhatsApp' },
  ]

  function patchChannel(channelId: string, patch: Partial<ChannelIntegration>) {
    setCfg((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.channelId === channelId ? { ...c, ...patch } : c)),
    }))
  }

  async function save() {
    const cleaned = apiDraft.trim().replace(/\/$/, '')
    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      flash('API URL must start with http:// or https://', 'err')
      return
    }
    setSaving(true)
    try {
      setApiBaseUrlOverride(cleaned)
      const next = saveDeliveryIntegrations(cfg)
      setCfg(next)
      setApiDraft(posApiBaseUrl())
      if (apiMastersReady() && activeBranchId) {
        for (const ch of cfg.channels) {
          if (!ch.enabled) continue
          await apiUpsertChannelConfig({
            branchId: activeBranchId,
            channelId: ch.channelId,
            enabled: ch.enabled,
            storeId: ch.storeId,
            apiKey: ch.apiKey,
            apiBaseUrl: ch.apiBaseUrl,
            webhookSecret: ch.webhookSecret,
          })
        }
        const rows = await apiListChannelConfigs(activeBranchId)
        setServerConfigs(rows)
      }
      flash('Saved')
      const ok = await recheckConnection()
      if (ok) void runSync({ quiet: true }).catch(() => undefined)
    } finally {
      setSaving(false)
    }
  }

  async function syncMenu(channelId: string) {
    if (!apiMastersReady() || !activeBranchId) {
      flash('API not connected', 'err')
      return
    }
    setSyncBusy(channelId)
    try {
      const res = await apiSyncChannelMenu(activeBranchId, channelId) as {
        result?: { mode?: string; message?: string }
        menu?: { items?: unknown[] }
      }
      const msg = res.result?.message ?? 'Menu synced'
      flash(`${channelId}: ${msg} · ${res.menu?.items?.length ?? 0} items`)
      const rows = await apiListChannelConfigs(activeBranchId)
      setServerConfigs(rows)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Sync failed', 'err')
    } finally {
      setSyncBusy(null)
    }
  }

  function serverNote(channelId: string) {
    const row = serverConfigs.find((r) => r.channelId === channelId)
    if (!row?.lastMenuSyncAt) return null
    return `${new Date(row.lastMenuSyncAt).toLocaleString()} · ${row.lastMenuSyncNote ?? ''}`
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to="/settings" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-company zk-dl-api">
      <HubHeader closeTo="/settings" />

      <div className="zk-company-body">
        <header className="zk-co-pagehead">
          <h1>{notifyMode ? 'Notification Settings' : 'Delivery APIs'}</h1>
          <p>
            {notifyMode
              ? 'SMS and WhatsApp alerts for delivery customers.'
              : 'Connect this POS to mesa-api and Saudi delivery channels.'}
          </p>
        </header>

        <div className="zk-co-split">
          <aside className="zk-co-list">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`zk-co-branch${section === s.id ? ' is-on' : ''}`}
                onClick={() => {
                  setSection(s.id)
                  if (s.id === 'alerts') setLog(loadNotifyLog())
                }}
              >
                <span className="zk-co-branch-code">{s.id === 'connection' ? '01' : s.id === 'channels' ? '02' : '03'}</span>
                <span className="zk-co-branch-copy">
                  <strong>{s.label}</strong>
                  <em>{s.hint}</em>
                </span>
              </button>
            ))}
          </aside>

          <div className="zk-dl-api-main">
            {section === 'connection' ? (
              <>
                <section className="zk-co-panel">
                  <div className="zk-co-panel-head">
                    <div>
                      <h2>Server connection</h2>
                      <p>URL of mesa-api used by this terminal.</p>
                    </div>
                  </div>
                  <div className="zk-co-fields">
                    <label className="zk-co-field zk-co-span-2">
                      <span>API base URL</span>
                      <div className="zk-dl-api-row">
                        <input
                          className="zk-co-input mesa-ltr-nums"
                          value={apiDraft}
                          onChange={(e) => setApiDraft(e.target.value)}
                          placeholder="http://192.168.0.122:3001"
                          spellCheck={false}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="zk-co-btn"
                          disabled={!apiDraft.trim()}
                          onClick={async () => {
                            if (await copyText(apiDraft.trim())) flash('Copied')
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </label>
                    {envDefault ? (
                      <p className="zk-dl-api-note zk-co-span-2">
                        Install default: {envDefault}
                        {apiDraft.trim() !== envDefault ? (
                          <>
                            {' · '}
                            <button type="button" className="zk-dl-api-link" onClick={() => setApiDraft(envDefault)}>
                              Reset
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className="zk-co-panel">
                  <div className="zk-co-panel-head">
                    <div>
                      <h2>Incoming webhook</h2>
                      <p>For HungerStation / Jahez middleware to push orders.</p>
                    </div>
                  </div>
                  <div className="zk-co-fields">
                    <label className="zk-co-field zk-co-span-2">
                      <span>Webhook URL</span>
                      <div className="zk-dl-api-row">
                        <input
                          className="zk-co-input mesa-ltr-nums"
                          readOnly
                          value={webhookUrl || 'Set API base URL first'}
                        />
                        <button
                          type="button"
                          className="zk-co-btn"
                          disabled={!webhookUrl}
                          onClick={async () => {
                            if (webhookUrl && (await copyText(webhookUrl))) flash('Copied')
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </label>
                    <label className="zk-co-field zk-co-span-2">
                      <span>Webhook secret</span>
                      <input
                        className="zk-co-input"
                        type="password"
                        value={cfg.ingestWebhookSecret}
                        onChange={(e) => setCfg({ ...cfg, ingestWebhookSecret: e.target.value })}
                        placeholder="Same as API server secret"
                        autoComplete="off"
                      />
                    </label>
                    <div className="zk-co-span-2">
                      <button
                        type="button"
                        className="zk-dl-api-link"
                        onClick={() => setShowSample((v) => !v)}
                      >
                        {showSample ? 'Hide sample request' : 'Show sample request'}
                      </button>
                      {showSample ? (
                        <pre className="zk-dl-api-sample">{`POST ${webhookUrl || '{API}/webhooks/delivery/ingest'}
X-Webhook-Secret: ${cfg.ingestWebhookSecret || '<secret>'}

{
  "companyId": "<company-id>",
  "branchId": "<branch-id>",
  "channel": "HungerStation",
  "externalOrderId": "HS-12345",
  "customer": "Ahmed",
  "phone": "05xxxxxxxx",
  "lines": [{ "name": "Kabsa", "qty": 1, "price": 42 }]
}`}</pre>
                      ) : null}
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {section === 'channels' ? (
              <section className="zk-co-panel">
                <div className="zk-co-panel-head">
                  <div>
                    <h2>Channel credentials</h2>
                    <p>Store partner keys when each platform is connected.</p>
                  </div>
                </div>
                <div className="zk-dl-api-channels">
                  {cfg.channels.map((row) => {
                    const meta = resolveDeliveryChannel(row.channelId)
                    return (
                      <div key={row.channelId} className="zk-dl-api-ch">
                        <div className="zk-dl-api-ch-top">
                          <div>
                            <strong>{meta.label}</strong>
                            <em>{meta.payModel === 'prepaid' ? 'Prepaid' : 'COD'}</em>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row.enabled}
                            className={`zk-user-switch${row.enabled ? ' on' : ''}`}
                            onClick={() => patchChannel(row.channelId, { enabled: !row.enabled })}
                          >
                            <i aria-hidden />
                            <strong>{row.enabled ? 'On' : 'Off'}</strong>
                          </button>
                        </div>
                        <div className="zk-co-fields">
                          <label className="zk-co-field">
                            <span>Store ID</span>
                            <input
                              className="zk-co-input"
                              value={row.storeId}
                              disabled={!row.enabled}
                              onChange={(e) => patchChannel(row.channelId, { storeId: e.target.value })}
                            />
                          </label>
                          <label className="zk-co-field">
                            <span>API key</span>
                            <input
                              className="zk-co-input"
                              type="password"
                              value={row.apiKey}
                              disabled={!row.enabled}
                              onChange={(e) => patchChannel(row.channelId, { apiKey: e.target.value })}
                              autoComplete="off"
                            />
                          </label>
                          <label className="zk-co-field zk-co-span-2">
                            <span>Partner API base URL</span>
                            <input
                              className="zk-co-input mesa-ltr-nums"
                              value={row.apiBaseUrl}
                              disabled={!row.enabled}
                              placeholder="Leave blank for default partner URL"
                              onChange={(e) => patchChannel(row.channelId, { apiBaseUrl: e.target.value })}
                            />
                          </label>
                          <div className="zk-co-span-2 zk-dl-api-ch-actions">
                            <button
                              type="button"
                              className="zk-co-btn"
                              disabled={!row.enabled || syncBusy === row.channelId}
                              onClick={() => void syncMenu(row.channelId)}
                            >
                              {syncBusy === row.channelId ? 'Syncing…' : 'Sync menu to platform'}
                            </button>
                            {serverNote(row.channelId) ? (
                              <span className="zk-dl-api-note">{serverNote(row.channelId)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {section === 'alerts' ? (
              <>
                <section className="zk-co-panel">
                  <div className="zk-co-panel-head">
                    <div>
                      <h2>Customer alerts</h2>
                      <p>Sent when a Direct order is dispatched (includes OTP).</p>
                    </div>
                  </div>
                  <div className="zk-co-fields">
                    <div className="zk-co-field">
                      <span>SMS</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cfg.notify.smsEnabled}
                        className={`zk-user-switch${cfg.notify.smsEnabled ? ' on' : ''}`}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            notify: { ...cfg.notify, smsEnabled: !cfg.notify.smsEnabled },
                          })
                        }
                      >
                        <i aria-hidden />
                        <strong>{cfg.notify.smsEnabled ? 'On' : 'Off'}</strong>
                      </button>
                    </div>
                    <div className="zk-co-field">
                      <span>WhatsApp</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cfg.notify.whatsappEnabled}
                        className={`zk-user-switch${cfg.notify.whatsappEnabled ? ' on' : ''}`}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            notify: {
                              ...cfg.notify,
                              whatsappEnabled: !cfg.notify.whatsappEnabled,
                            },
                          })
                        }
                      >
                        <i aria-hidden />
                        <strong>{cfg.notify.whatsappEnabled ? 'On' : 'Off'}</strong>
                      </button>
                    </div>
                    <label className="zk-co-field">
                      <span>Provider</span>
                      <MesaSelect
                        value={cfg.notify.provider}
                        onChange={(v) =>
                          setCfg({
                            ...cfg,
                            notify: {
                              ...cfg.notify,
                              provider: v as DeliveryIntegrationsConfig['notify']['provider'],
                            },
                          })
                        }
                        options={[
                          { value: 'stub', label: 'Log only (test)' },
                          { value: 'unifonic', label: 'Unifonic' },
                          { value: 'twilio', label: 'Twilio' },
                        ]}
                      />
                    </label>
                    <label className="zk-co-field">
                      <span>Sender ID</span>
                      <input
                        className="zk-co-input"
                        value={cfg.notify.senderId}
                        onChange={(e) =>
                          setCfg({ ...cfg, notify: { ...cfg.notify, senderId: e.target.value } })
                        }
                      />
                    </label>
                    <label className="zk-co-field zk-co-span-2">
                      <span>Provider API key</span>
                      <input
                        className="zk-co-input"
                        type="password"
                        value={cfg.notify.providerApiKey}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            notify: { ...cfg.notify, providerApiKey: e.target.value },
                          })
                        }
                        placeholder="Optional"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </section>

                <section className="zk-co-panel">
                  <div className="zk-co-panel-head">
                    <div>
                      <h2>Message log</h2>
                      <p>Recent alerts from this terminal.</p>
                    </div>
                    <button
                      type="button"
                      className="zk-co-btn"
                      onClick={() => {
                        clearNotifyLog()
                        setLog([])
                        flash('Log cleared')
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  {log.length === 0 ? (
                    <p className="zk-dl-api-note">No messages yet.</p>
                  ) : (
                    <ul className="zk-dl-api-log">
                      {log.map((ev) => (
                        <li key={ev.id}>
                          <strong>
                            {new Date(ev.at).toLocaleString()} · {ev.channel.toUpperCase()} · {ev.to}
                          </strong>
                          <span>{ev.body}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <HubFooter
        backTo="/settings"
        backLabel="Settings"
        actions={
          <div className="zk-company-foot-actions">
            <button
              type="button"
              className="zk-co-btn primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />
    </div>
  )
}
