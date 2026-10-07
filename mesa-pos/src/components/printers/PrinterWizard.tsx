import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import MesaSelect from '../MesaSelect'
import Req from '../Req'
import { normalizeTemplateId, templatesForKind, type PrintTemplateId } from '../../data/printTemplates'
import {
  normalizePrinter,
  printerTarget,
  ROUTE_ORDER_TYPES,
  type PrintPurpose,
  type PrinterConnection,
  type PrinterOptions,
  type PrinterRouting,
  type PrintStation,
} from '../../data/printers'
import {
  AGENT_DOWNLOAD_URL,
  friendlyPrintError,
  listSystemPrinters,
  testConnection,
  type AgentError,
  type SystemPrinter,
} from '../../hardware/printAgent'
import { testPrintStation } from '../../hardware/printer'
import type { Lang } from '../../locale/i18n'
import PrinterStatusBadge, { type BadgeTone } from './PrinterStatusBadge'

export type WizardStep = 'basic' | 'connection' | 'routing' | 'settings' | 'test'
type Step = WizardStep
const STEPS: { id: Step; label: string }[] = [
  { id: 'basic', label: 'Basic details' },
  { id: 'connection', label: 'Connection' },
  { id: 'routing', label: 'Assignment' },
  { id: 'settings', label: 'Print settings' },
  { id: 'test', label: 'Test print' },
]

export type WizardCategory = { id: string; name: string; parentId?: string }

function categoryLabel(c: WizardCategory, all: WizardCategory[]) {
  const parent = c.parentId ? all.find((p) => p.id === c.parentId) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}

const PURPOSES: { id: PrintPurpose; label: string }[] = [
  { id: 'kot', label: 'KOT' },
  { id: 'bill', label: 'Bill' },
  { id: 'receipt', label: 'Receipt' },
]

const CONNECTIONS: { id: PrinterConnection; label: string; hint: string }[] = [
  { id: 'usb', label: 'USB', hint: 'Cable to this computer' },
  { id: 'lan', label: 'LAN / IP', hint: 'Network cable' },
  { id: 'wifi', label: 'Wi-Fi', hint: 'Wireless network' },
  { id: 'browser', label: 'Print dialog', hint: 'No agent — choose each time' },
]

const OPTION_CHECKS: { key: keyof PrinterOptions; label: string; receiptOnly?: boolean }[] = [
  { key: 'autoCut', label: 'Auto cut paper (if supported)' },
  { key: 'autoPrint', label: 'Print automatically (no Print button)', receiptOnly: true },
  { key: 'printName', label: 'Print restaurant name on bills', receiptOnly: true },
  { key: 'printAddress', label: 'Print address', receiptOnly: true },
  { key: 'printPhone', label: 'Print phone', receiptOnly: true },
  { key: 'printVat', label: 'Print VAT number on bills', receiptOnly: true },
  { key: 'printFooter', label: 'Print footer (thank-you message)', receiptOnly: true },
  { key: 'openDrawer', label: 'Open cash drawer after receipt', receiptOnly: true },
]

const IP_OR_HOST = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}$|^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i

type ConnResult = { ok: boolean; title: string; detail?: string } | null
type TestState = { phase: 'idle' | 'sending' | 'done'; ok?: boolean; title?: string; hint?: string }

function stateTone(state: SystemPrinter['state']): BadgeTone {
  if (state === 'online') return 'online'
  if (state === 'offline' || state === 'error' || state === 'paper-out' || state === 'cover-open') return 'offline'
  return 'idle'
}

export default function PrinterWizard({
  initial,
  isNew,
  categories,
  areas,
  lang,
  initialStep = 'basic',
  onSave,
  onCancel,
}: {
  initial: PrintStation
  isNew: boolean
  categories: WizardCategory[]
  areas: { id: string; name: string }[]
  lang: Lang
  initialStep?: Step
  onSave: (row: PrintStation) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<PrintStation>(initial)
  const [step, setStep] = useState<Step>(initialStep)
  const [visited, setVisited] = useState<Set<Step>>(() => new Set(isNew ? ['basic'] : STEPS.map((s) => s.id)))
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<SystemPrinter[]>([])
  const [devicesError, setDevicesError] = useState<AgentError | null>(null)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [showAllDevices, setShowAllDevices] = useState(false)
  const [conn, setConn] = useState<ConnResult>(null)
  const [testingConn, setTestingConn] = useState(false)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  const set = (patch: Partial<PrintStation>) => setDraft((d) => ({ ...d, ...patch }))
  const setOpt = (patch: Partial<PrinterOptions>) => setDraft((d) => ({ ...d, options: { ...d.options, ...patch } }))
  const toggleRoute = <K extends keyof PrinterRouting>(key: K, id: PrinterRouting[K][number]) =>
    setDraft((d) => {
      const list = d.options.routing[key] as string[]
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
      return { ...d, options: { ...d.options, routing: { ...d.options.routing, [key]: next } } }
    })
  const kotOnly = draft.purposes.length > 0 && draft.purposes.every((p) => p === 'kot')
  const templateKind = kotOnly ? 'kot' : 'receipt'
  const network = draft.connection === 'lan' || draft.connection === 'wifi'

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true)
    const res = await listSystemPrinters()
    setDevices(res.printers)
    setDevicesError(res.error ?? null)
    setLoadingDevices(false)
  }, [])

  useEffect(() => {
    if (step === 'connection' && draft.connection === 'usb') void refreshDevices()
  }, [step, draft.connection, refreshDevices])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const shownDevices = useMemo(() => {
    const list = showAllDevices ? devices : devices.filter((d) => !d.isVirtual)
    return [...list].sort((a, b) => Number(b.isUsb) - Number(a.isUsb) || a.name.localeCompare(b.name))
  }, [devices, showAllDevices])

  function validate(s: Step): string {
    if (s === 'basic') {
      if (!draft.name.trim()) return 'Printer name is required'
      if (!draft.purposes.length) return 'Choose at least one printer type'
    }
    if (s === 'connection') {
      if (draft.connection === 'usb' && !draft.target.trim()) return 'Select the USB printer'
      if (network) {
        if (!draft.host?.trim() || !IP_OR_HOST.test(draft.host.trim())) return 'Enter a valid printer IP address'
        const port = Number(draft.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be between 1 and 65535'
      }
    }
    if (s === 'settings' && Number(draft.paperWidthMm) < 48) return 'Unsupported paper width'
    return ''
  }

  function go(next: Step) {
    const order = STEPS.map((s) => s.id)
    if (order.indexOf(next) > order.indexOf(step)) {
      for (const s of order.slice(0, order.indexOf(next))) {
        const msg = validate(s)
        if (msg) {
          setStep(s)
          setError(msg)
          return
        }
      }
    }
    setError('')
    setStep(next)
    setVisited((v) => new Set(v).add(next))
  }

  function finalRow(): PrintStation {
    const kot = draft.purposes.includes('kot')
    const row = normalizePrinter({
      ...draft,
      name: draft.name.trim(),
      host: network ? draft.host?.trim() : undefined,
      port: network ? Number(draft.port) || 9100 : undefined,
      departmentId: kot ? draft.departmentId : undefined,
      templateId: normalizeTemplateId(draft.templateId, templateKind),
      options: {
        ...draft.options,
        routing: { ...draft.options.routing, categoryIds: kot ? draft.options.routing.categoryIds : [] },
      },
    })
    return { ...row, target: printerTarget(row) || 'browser' }
  }

  function save() {
    for (const s of ['basic', 'connection', 'settings'] as Step[]) {
      const msg = validate(s)
      if (msg) {
        setStep(s)
        setError(msg)
        return
      }
    }
    onSave(finalRow())
  }

  async function runConnTest() {
    const msg = validate('connection')
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    setTestingConn(true)
    setConn(null)
    const res = await testConnection(draft.host!.trim(), Number(draft.port) || 9100, draft.options.timeoutMs)
    setTestingConn(false)
    if (res.ok) {
      setConn({ ok: true, title: 'Printer connected successfully', detail: res.detail })
    } else {
      const f = friendlyPrintError(res.code ? { code: res.code, message: res.detail ?? '' } : undefined, draft.name || 'Printer')
      setConn({ ok: false, title: res.code === 'AGENT_UNREACHABLE' ? f.title : 'Unable to connect to printer', detail: res.code === 'AGENT_UNREACHABLE' ? f.hint : res.detail || f.hint })
    }
  }

  async function runTestPrint() {
    for (const s of ['basic', 'connection'] as Step[]) {
      const msg = validate(s)
      if (msg) {
        setStep(s)
        setError(msg)
        return
      }
    }
    setError('')
    setTest({ phase: 'sending' })
    const res = await testPrintStation(finalRow(), lang)
    if (res.ok) {
      setTest({
        phase: 'done',
        ok: true,
        title: res.mode === 'agent' || res.mode === 'silent' ? 'Test print sent successfully' : 'Test print opened',
        hint: res.mode === 'agent' || res.mode === 'silent' ? 'Check the printer for the test slip.' : 'Choose the thermal printer in the print dialog.',
      })
    } else {
      setTest({ phase: 'done', ok: false, title: res.error || 'Test print failed', hint: res.hint })
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const agentMissing = devicesError?.code === 'AGENT_UNREACHABLE' || devicesError?.code === 'ORIGIN_NOT_ALLOWED'

  return createPortal(
    <div className="modal-backdrop zk-pm-backdrop" role="dialog" aria-modal="true" aria-labelledby="zk-pm-wizard-title" onClick={onCancel}>
      <div className="modal-card zk-pm-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="zk-pm-wizard-head">
          <h2 id="zk-pm-wizard-title">{isNew ? 'Add printer' : `Edit printer · ${initial.name}`}</h2>
          <button type="button" className="zk-pm-close" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="zk-pm-steps" role="tablist">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={step === s.id}
              className={`zk-pm-step${step === s.id ? ' on' : ''}${i < stepIndex ? ' done' : ''}`}
              disabled={!visited.has(s.id)}
              onClick={() => go(s.id)}
            >
              <span className="zk-pm-step-no">{i + 1}</span>
              <span className="zk-pm-step-label">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="zk-pm-wizard-body">
          {step === 'basic' ? (
            <div className="zk-pm-form">
              <label className="zk-pm-field">
                <span>Printer name <Req /></span>
                <input className="search" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Kitchen Printer" autoFocus />
              </label>

              <div className="zk-pm-field">
                <span>Printer type <Req /> <small>— choose one or more</small></span>
                <div className="zk-pm-seg">
                  {PURPOSES.map((p) => {
                    const on = draft.purposes.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`zk-pm-seg-btn${on ? ' on' : ''}`}
                        aria-pressed={on}
                        onClick={() => set({ purposes: on ? draft.purposes.filter((x) => x !== p.id) : [...draft.purposes, p.id] })}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="zk-pm-field">
                <span>Connection type <Req /></span>
                <div className="zk-pm-radios">
                  {CONNECTIONS.map((c) => (
                    <label key={c.id} className={`zk-pm-radio${draft.connection === c.id ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="zk-pm-connection"
                        checked={draft.connection === c.id}
                        onChange={() => {
                          setConn(null)
                          set({
                            connection: c.id,
                            port: c.id === 'lan' || c.id === 'wifi' ? draft.port || 9100 : draft.port,
                            target: c.id === 'usb' ? (draft.connection === 'usb' ? draft.target : '') : draft.target,
                          })
                        }}
                      />
                      <span>
                        <strong>{c.label}</strong>
                        <small>{c.hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="zk-pm-toggles">
                <label className="zk-pm-check">
                  <input type="checkbox" checked={draft.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
                  Default printer for its type
                </label>
                <label className="zk-pm-check">
                  <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
                  Enabled
                </label>
              </div>
            </div>
          ) : null}

          {step === 'connection' ? (
            <div className="zk-pm-form">
              {draft.connection === 'usb' ? (
                <>
                  <div className="zk-pm-field-head">
                    <span>Detected printers</span>
                    <button type="button" className="zk-pm-btn" onClick={() => void refreshDevices()} disabled={loadingDevices}>
                      {loadingDevices ? 'Searching…' : 'Refresh devices'}
                    </button>
                  </div>
                  {agentMissing ? (
                    <div className="zk-pm-callout is-warn">
                      <strong>{friendlyPrintError(devicesError ?? undefined).title}</strong>
                      <span>{friendlyPrintError(devicesError ?? undefined).hint}</span>
                      <a className="zk-pm-btn" href={AGENT_DOWNLOAD_URL} download>Download Print Agent</a>
                    </div>
                  ) : loadingDevices && !devices.length ? (
                    <p className="zk-pm-muted">Looking for printers on this computer…</p>
                  ) : shownDevices.length === 0 ? (
                    <div className="zk-pm-callout">
                      <strong>No USB thermal printer detected.</strong>
                      <span>Connect the printer, install its Windows driver, and click Refresh.</span>
                    </div>
                  ) : (
                    <div className="zk-pm-devices" role="radiogroup" aria-label="Detected printers">
                      {shownDevices.map((d) => (
                        <label key={d.name} className={`zk-pm-device${draft.target === d.name ? ' on' : ''}`}>
                          <input type="radio" name="zk-pm-device" checked={draft.target === d.name} onChange={() => set({ target: d.name })} />
                          <span className="zk-pm-device-main">
                            <strong>{d.name}</strong>
                            <small>
                              {d.isUsb ? 'USB' : d.isNetwork ? `Network · ${d.host}` : d.portName} · {d.driver}
                            </small>
                          </span>
                          <PrinterStatusBadge tone={stateTone(d.state)} label={d.state === 'online' ? 'Ready' : d.detail || d.state} />
                        </label>
                      ))}
                    </div>
                  )}
                  {devices.some((d) => d.isVirtual) ? (
                    <label className="zk-pm-check zk-pm-small">
                      <input type="checkbox" checked={showAllDevices} onChange={(e) => setShowAllDevices(e.target.checked)} />
                      Show PDF / virtual printers
                    </label>
                  ) : null}
                  {draft.target && !devices.some((d) => d.name === draft.target) && !loadingDevices && !agentMissing ? (
                    <p className="zk-pm-callout is-warn">“{draft.target}” is not installed on this computer.</p>
                  ) : null}
                </>
              ) : network ? (
                <>
                  <div className="zk-pm-grid-2">
                    <label className="zk-pm-field">
                      <span>Printer IP <Req /></span>
                      <input
                        className="search"
                        inputMode="decimal"
                        placeholder="192.168.1.20"
                        value={draft.host ?? ''}
                        onChange={(e) => {
                          setConn(null)
                          set({ host: e.target.value.trim() })
                        }}
                      />
                    </label>
                    <label className="zk-pm-field">
                      <span>Port <Req /></span>
                      <input
                        className="search"
                        inputMode="numeric"
                        value={String(draft.port ?? 9100)}
                        onChange={(e) => {
                          setConn(null)
                          set({ port: Number(e.target.value.replace(/\D/g, '')) || 0 })
                        }}
                      />
                    </label>
                  </div>
                  <label className="zk-pm-field zk-pm-narrow">
                    <span>Connection timeout</span>
                    <MesaSelect
                      value={String(draft.options.timeoutMs)}
                      onChange={(v) => setOpt({ timeoutMs: Number(v) })}
                      options={[3000, 5000, 10000, 15000].map((ms) => ({ value: String(ms), label: `${ms / 1000} seconds` }))}
                    />
                  </label>
                  <div>
                    <button type="button" className="zk-pm-btn primary" onClick={() => void runConnTest()} disabled={testingConn}>
                      {testingConn ? 'Testing…' : 'Test connection'}
                    </button>
                  </div>
                  {conn ? (
                    <div className={`zk-pm-callout ${conn.ok ? 'is-ok' : 'is-bad'}`}>
                      <strong>{conn.ok ? '✓' : '✕'} {conn.title}</strong>
                      {conn.detail ? <span>{conn.detail}</span> : null}
                    </div>
                  ) : null}
                  <p className="zk-pm-muted zk-pm-small">
                    {draft.connection === 'wifi'
                      ? 'Wi-Fi printers work like network printers: give the printer a fixed IP on your router, then enter it here.'
                      : 'Most thermal printers print their IP address when you hold the feed button while switching them on.'}
                  </p>
                </>
              ) : (
                <div className="zk-pm-callout">
                  <strong>Printing through the browser dialog</strong>
                  <span>
                    Each print opens the print dialog and the cashier picks the printer. For silent printing straight to a thermal
                    printer, install the Isarva Print Agent and choose USB, LAN or Wi-Fi.
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {step === 'routing' ? (
            <div className="zk-pm-form">
              <p className="zk-pm-muted zk-pm-small">
                Leave a section empty to print for all of it. When several printers match, the most specific one prints;
                if none match, the default printer of that type prints so nothing is lost.
              </p>

              <div className="zk-pm-field">
                <span>Order types</span>
                <div className="zk-pm-chips">
                  {ROUTE_ORDER_TYPES.map((o) => {
                    const on = draft.options.routing.orderTypes.includes(o.id)
                    return (
                      <button key={o.id} type="button" className={`zk-pm-seg-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleRoute('orderTypes', o.id)}>
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                <small className="zk-pm-muted">{draft.options.routing.orderTypes.length ? '' : 'All order types'}</small>
              </div>

              <div className="zk-pm-field">
                <span>Dine-in areas</span>
                {areas.length ? (
                  <div className="zk-pm-chips">
                    {areas.map((a) => {
                      const on = draft.options.routing.areaIds.includes(a.id)
                      return (
                        <button key={a.id} type="button" className={`zk-pm-seg-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleRoute('areaIds', a.id)}>
                          {a.name}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <small className="zk-pm-muted">No floor areas yet — add them in Settings → Floor & Tables.</small>
                )}
                {areas.length ? (
                  <small className="zk-pm-muted">
                    {draft.options.routing.areaIds.length ? 'Only dine-in tables in the selected areas' : 'All areas'}
                  </small>
                ) : null}
              </div>

              {draft.purposes.includes('kot') ? (
                <>
                  <label className="zk-pm-field">
                    <span>Kitchen department <small>— KOT items of this department print here</small></span>
                    <MesaSelect
                      value={draft.departmentId ?? ''}
                      onChange={(v) => set({ departmentId: v || undefined })}
                      options={[
                        { value: '', label: 'All departments' },
                        ...categories.filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </label>
                  <div className="zk-pm-field">
                    <span>Menu categories <small>— KOT only; a category includes its sub-categories</small></span>
                    {categories.length ? (
                      <div className="zk-pm-chips zk-pm-chips-scroll">
                        {categories.map((c) => {
                          const on = draft.options.routing.categoryIds.includes(c.id)
                          return (
                            <button key={c.id} type="button" className={`zk-pm-seg-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleRoute('categoryIds', c.id)}>
                              {categoryLabel(c, categories)}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <small className="zk-pm-muted">No menu categories yet.</small>
                    )}
                    <small className="zk-pm-muted">{draft.options.routing.categoryIds.length ? '' : 'All categories'}</small>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 'settings' ? (
            <div className="zk-pm-form">
              <div className="zk-pm-field">
                <span>Paper width</span>
                <div className="zk-pm-seg">
                  {[58, 80].map((mm) => (
                    <button key={mm} type="button" className={`zk-pm-seg-btn${Number(draft.paperWidthMm) === mm ? ' on' : ''}`} onClick={() => set({ paperWidthMm: mm })}>
                      {mm} mm
                    </button>
                  ))}
                  {![58, 80].includes(Number(draft.paperWidthMm)) ? (
                    <button type="button" className="zk-pm-seg-btn on">{draft.paperWidthMm} mm</button>
                  ) : null}
                </div>
              </div>

              <div className="zk-pm-checks">
                {OPTION_CHECKS.filter((o) => !(o.receiptOnly && kotOnly)).map((o) => (
                  <label key={o.key} className="zk-pm-check">
                    <input type="checkbox" checked={Boolean(draft.options[o.key])} onChange={(e) => setOpt({ [o.key]: e.target.checked } as Partial<PrinterOptions>)} />
                    {o.label}
                  </label>
                ))}
              </div>

              <div className="zk-pm-grid-2">
                <div className="zk-pm-field">
                  <span>Number of copies</span>
                  <div className="zk-pm-stepper">
                    <button type="button" onClick={() => set({ copies: Math.max(1, draft.copies - 1) })} aria-label="Fewer copies">−</button>
                    <output>{draft.copies}</output>
                    <button type="button" onClick={() => set({ copies: Math.min(5, draft.copies + 1) })} aria-label="More copies">+</button>
                  </div>
                </div>
                <label className="zk-pm-field">
                  <span>Character encoding</span>
                  <MesaSelect value="auto" onChange={() => undefined} options={[{ value: 'auto', label: 'Auto (Arabic & English)' }]} disabled />
                </label>
              </div>

              <div className="zk-pm-grid-2">
                <div className="zk-pm-field">
                  <span>Font size</span>
                  <div className="zk-pm-seg">
                    {(['small', 'medium', 'large'] as const).map((f) => (
                      <button key={f} type="button" className={`zk-pm-seg-btn${draft.options.fontSize === f ? ' on' : ''}`} onClick={() => setOpt({ fontSize: f })}>
                        {f[0].toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="zk-pm-field">
                  <span>Header alignment</span>
                  <div className="zk-pm-seg">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} type="button" className={`zk-pm-seg-btn${draft.options.align === a ? ' on' : ''}`} onClick={() => setOpt({ align: a })}>
                        {a[0].toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="zk-pm-grid-2">
                <label className="zk-pm-field">
                  <span>Design</span>
                  <MesaSelect
                    value={normalizeTemplateId(draft.templateId, templateKind)}
                    onChange={(v) => set({ templateId: v as PrintTemplateId })}
                    options={templatesForKind(templateKind).map((t) => ({ value: t.id, label: t.name }))}
                  />
                </label>
                {draft.connection === 'usb' ? (
                  <label className="zk-pm-field">
                    <span>Print method</span>
                    <MesaSelect
                      value={draft.options.printMode}
                      onChange={(v) => setOpt({ printMode: v === 'driver' ? 'driver' : 'escpos' })}
                      options={[
                        { value: 'escpos', label: 'Direct ESC/POS (recommended)' },
                        { value: 'driver', label: 'Windows printer driver' },
                      ]}
                    />
                  </label>
                ) : null}
              </div>

              {!kotOnly ? (
                <div className="zk-pm-grid-2">
                  <label className="zk-pm-field">
                    <span>Header text</span>
                    <input className="search" value={draft.header} onChange={(e) => set({ header: e.target.value })} placeholder="Restaurant name" />
                  </label>
                  <label className="zk-pm-field">
                    <span>Footer text</span>
                    <input className="search" value={draft.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="Thank you — visit again" />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'test' ? (
            <div className="zk-pm-form zk-pm-test">
              <p>Send a test slip to <strong>{draft.name || 'this printer'}</strong> using the settings above. Nothing is saved until you click Save printer.</p>
              <div>
                <button type="button" className="zk-pm-btn primary lg" onClick={() => void runTestPrint()} disabled={test.phase === 'sending'}>
                  {test.phase === 'sending' ? 'Sending test print…' : 'Print test page'}
                </button>
              </div>
              {test.phase === 'done' ? (
                <div className={`zk-pm-callout ${test.ok ? 'is-ok' : 'is-bad'}`}>
                  <strong>{test.ok ? '✓' : '✕'} {test.title}</strong>
                  {test.hint ? <span>{test.hint}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="zk-pm-error" role="alert">{error}</p> : null}
        </div>

        <div className="zk-pm-wizard-foot">
          {stepIndex === 0 ? (
            <button type="button" className="zk-pm-btn" onClick={onCancel}>Cancel</button>
          ) : (
            <button type="button" className="zk-pm-btn" onClick={() => go(STEPS[stepIndex - 1].id)}>Back</button>
          )}
          <span className="zk-pm-foot-spacer" />
          {!isNew && stepIndex < STEPS.length - 1 ? (
            <button type="button" className="zk-pm-btn" onClick={save}>Save printer</button>
          ) : null}
          {stepIndex < STEPS.length - 1 ? (
            <button type="button" className="zk-pm-btn primary" onClick={() => go(STEPS[stepIndex + 1].id)}>Next</button>
          ) : (
            <button type="button" className="zk-pm-btn primary" onClick={save}>Save printer</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
