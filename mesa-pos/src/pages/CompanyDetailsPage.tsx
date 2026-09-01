import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import MesaSelect from '../components/MesaSelect'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import { currencyOptions, type Branch, type CompanyProfile } from '../data/company'
import { branchDisplayName } from '../lib/branding'
import { fileToLogoDataUrl, LOGO_TOO_LARGE } from '../lib/logoFile'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'
import { apiGetZatcaConfig, apiPutZatcaConfig, apiZatcaReady } from '../lib/apiZatca'
import { cacheZatcaPhase2Config, peekZatcaPhase2Config } from '../hardware/zatca'

function emptyBranch(companyId: string): Branch {
  return {
    id: `br-${Date.now()}`,
    companyId,
    name: '',
    nameAr: '',
    code: '',
    address: '',
    addressAr: '',
    phone: '',
    active: true,
  }
}

export default function CompanyDetailsPage() {
  const { user, selectedCompany, updateSelectedCompany } = useAuth()
  const { flash } = usePos()
  const { t, lang } = useI18n()
  const [searchParams] = useSearchParams()
  const {
    company,
    branches,
    activeBranchId,
    setCompany,
    upsertBranch,
    removeBranch,
    switchBranch,
  } = useBranch()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const zatcaRef = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [hq, setHq] = useState<CompanyProfile>(company)
  const [editing, setEditing] = useState<Branch | null>(
    () => branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? null,
  )
  const [successOpen, setSuccessOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const envForced = import.meta.env.VITE_ZATCA_ENABLED === 'true'
  const cachedP2 = peekZatcaPhase2Config()
  const [phase2Enabled, setPhase2Enabled] = useState(!!cachedP2?.phase2Enabled)
  const [phase2Env, setPhase2Env] = useState<'sandbox' | 'production'>(
    cachedP2?.environment === 'production' ? 'production' : 'sandbox',
  )
  const [csid, setCsid] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [binaryToken, setBinaryToken] = useState('')
  const [hasCsid, setHasCsid] = useState(!!cachedP2?.hasCsid)
  const [hasPrivateKey, setHasPrivateKey] = useState(!!cachedP2?.hasPrivateKey)
  const [hasBinaryToken, setHasBinaryToken] = useState(!!cachedP2?.hasBinaryToken)
  const [proxyConfigured, setProxyConfigured] = useState(!!cachedP2?.proxyConfigured)

  useEffect(() => {
    if (dirty.current) return
    setHq(company)
  }, [company])

  useEffect(() => {
    if (!apiZatcaReady()) return
    void apiGetZatcaConfig()
      .then((cfg) => {
        cacheZatcaPhase2Config(cfg)
        if (dirty.current) return
        setPhase2Enabled(cfg.phase2Enabled)
        setPhase2Env(cfg.environment === 'production' ? 'production' : 'sandbox')
        setHasCsid(cfg.hasCsid)
        setHasPrivateKey(cfg.hasPrivateKey)
        setHasBinaryToken(cfg.hasBinaryToken)
        setProxyConfigured(cfg.proxyConfigured)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (searchParams.get('focus') !== 'zatca') return
    window.requestAnimationFrame(() => {
      zatcaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [searchParams])

  useEffect(() => {
    if (dirty.current) return
    setEditing((prev) => {
      const next = branches.find((b) => b.id === (prev?.id ?? activeBranchId)) ?? branches[0] ?? null
      return next
    })
  }, [activeBranchId, branches])

  function markDirty() {
    dirty.current = true
  }

  function patchHq<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    markDirty()
    setHq((prev) => ({ ...prev, [key]: value }))
  }

  function patchBranch<K extends keyof Branch>(key: K, value: Branch[K]) {
    markDirty()
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function onBrowse(file: File | undefined) {
    if (!file) return
    try {
      const logoDataUrl = await fileToLogoDataUrl(file)
      patchHq('logoDataUrl', logoDataUrl)
    } catch (err) {
      flash(err instanceof Error && err.message === LOGO_TOO_LARGE ? t.logoTooLarge : t.failedTitle, 'err')
    }
  }

  async function save() {
    if (!hq.companyName.trim()) {
      flash(t.companyNameRequired)
      return
    }
    if (!editing?.name.trim()) {
      flash(t.branchNameRequired)
      return
    }
    if (!editing.code.trim()) {
      flash(t.branchCodeRequired)
      return
    }
    if (hq.zatcaEnabled && hq.taxId.replace(/\D/g, '').length < 10) {
      flash(t.zatcaVatRequired, 'err')
      return
    }
    const nextHq: CompanyProfile = {
      ...hq,
      companyName: hq.companyName.trim(),
      aliasName: hq.aliasName.trim(),
      taxId: hq.taxId.trim(),
      zatcaEnabled: !!hq.zatcaEnabled,
    }
    const nextBranch: Branch = {
      ...editing,
      companyId: nextHq.id,
      name: editing.name.trim(),
      nameAr: editing.nameAr.trim(),
      code: editing.code.trim().toUpperCase(),
      address: editing.address.trim(),
      addressAr: editing.addressAr.trim(),
      phone: editing.phone.trim(),
    }
    const nextBranches = branches.some((b) => b.id === nextBranch.id)
      ? branches.map((b) => (b.id === nextBranch.id ? nextBranch : b))
      : [...branches, nextBranch]

    const applyLocal = (profile: CompanyProfile) => {
      // Persist profile first; updateSelectedCompany must keep zatcaEnabled (see Auth toCompanyProfile).
      setCompany(profile)
      upsertBranch(nextBranch)
      updateSelectedCompany({
        ...(selectedCompany ?? { id: profile.id, companyName: profile.companyName }),
        ...profile,
        zatcaEnabled: !!profile.zatcaEnabled,
        branches: nextBranches,
      })
      setHq(profile)
    }

    setSaving(true)
    try {
      applyLocal(nextHq)
      if (apiZatcaReady() && (hq.zatcaEnabled || phase2Enabled || envForced)) {
        try {
          const cfg = await apiPutZatcaConfig({
            phase2Enabled,
            environment: phase2Env,
            ...(csid.trim() ? { csid: csid.trim() } : {}),
            ...(privateKey.trim() ? { privateKey: privateKey.trim() } : {}),
            ...(binaryToken.trim() ? { binaryToken: binaryToken.trim() } : {}),
          })
          cacheZatcaPhase2Config(cfg)
          setHasCsid(cfg.hasCsid)
          setHasPrivateKey(cfg.hasPrivateKey)
          setHasBinaryToken(cfg.hasBinaryToken)
          setProxyConfigured(cfg.proxyConfigured)
          setCsid('')
          setPrivateKey('')
          setBinaryToken('')
        } catch (zerr) {
          flash(zerr instanceof Error ? zerr.message : t.failedTitle, 'err')
        }
      }
      switchBranch(nextBranch.id)
      setEditing(nextBranch)
      dirty.current = false
      setSuccessOpen(true)
    } catch (err) {
      applyLocal(nextHq)
      switchBranch(nextBranch.id)
      setEditing(nextBranch)
      dirty.current = false
      flash(err instanceof Error ? err.message : t.companySavedOffline, 'err')
    } finally {
      setSaving(false)
    }
  }

  function addBranch() {
    markDirty()
    const b = emptyBranch(hq.id)
    setEditing(b)
  }

  function cancel() {
    dirty.current = false
    setHq(company)
    setEditing(branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? null)
    flash(t.changesDiscarded)
  }

  const branchList =
    editing && !branches.some((b) => b.id === editing.id) ? [...branches, editing] : branches

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.companyLocked}</strong>
          {t.companyLockedHint}
          <div style={{ marginTop: '1rem' }}>
            <Link to="/settings" className="btn btn-ghost">
              {t.backToSettings}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-company">
      <HubHeader company={hq} />

      <div className="zk-company-body">
        <header className="zk-co-pagehead">
          <h1>{t.companyAndBranches}</h1>
          <p>{t.companyPageHint}</p>
        </header>

        <section className="zk-co-panel">
          <div className="zk-co-panel-head">
            <div>
              <h2>{t.companyShared}</h2>
              <p>{t.companySharedHint}</p>
            </div>
          </div>

          <div className="zk-co-identity">
            <div className="zk-co-logo">
              <span>{t.companyLogo}</span>
              <button
                type="button"
                className={`zk-co-preview${hq.logoDataUrl ? ' has-img' : ''}`}
                style={hq.logoDataUrl ? { backgroundImage: `url(${hq.logoDataUrl})` } : undefined}
                onClick={() => fileRef.current?.click()}
              >
                {!hq.logoDataUrl ? <em>{t.noLogo}</em> : null}
              </button>
              <div className="zk-co-logo-actions">
                <button type="button" className="zk-co-btn" onClick={() => fileRef.current?.click()}>
                  {t.browse}
                </button>
                <button
                  type="button"
                  className="zk-co-btn danger"
                  disabled={!hq.logoDataUrl}
                  onClick={() => patchHq('logoDataUrl', undefined)}
                >
                  {t.delete}
                </button>
              </div>
              <small>{t.maxLogoSize}</small>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onBrowse(e.target.files?.[0])}
              />
            </div>

            <div className="zk-co-fields">
              <label className="zk-co-field zk-co-span-2">
                <span>
                  {t.companyName} <i>*</i>
                </span>
                <input
                  className="zk-co-input"
                  value={hq.companyName}
                  onChange={(e) => patchHq('companyName', e.target.value)}
                />
              </label>
              <label className="zk-co-field zk-co-span-2">
                <span>{t.aliasNameAr}</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="zk-co-input"
                  value={hq.aliasName}
                  onChange={(aliasName) => patchHq('aliasName', aliasName)}
                  suggestFrom={hq.companyName}
                />
              </label>
              <label className="zk-co-field">
                <span>{t.taxIdVat}</span>
                <input
                  className="zk-co-input mesa-ltr-nums"
                  value={hq.taxId}
                  onChange={(e) => patchHq('taxId', e.target.value)}
                  placeholder="3xxxxxxxxxxxxxxx003"
                />
              </label>
              <label className="zk-co-field">
                <span>{t.currency}</span>
                <MesaSelect
                  value={hq.currency}
                  onChange={(v) => patchHq('currency', v)}
                  options={currencyOptions.map((c) => ({ value: c, label: c }))}
                />
              </label>
              <label className="zk-co-field">
                <span>{t.hqPhone}</span>
                <input
                  className="zk-co-input mesa-ltr-nums"
                  value={hq.hqPhone ?? ''}
                  onChange={(e) => patchHq('hqPhone', e.target.value)}
                  placeholder="+966 …"
                />
              </label>
              <div className="zk-co-field">
                <span>{t.tax}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hq.enableTax}
                  className={`zk-user-switch${hq.enableTax ? ' on' : ''}`}
                  onClick={() => patchHq('enableTax', !hq.enableTax)}
                >
                  <i aria-hidden />
                  <strong>{t.enableTaxKsa}</strong>
                </button>
              </div>
              <div className="zk-co-field zk-co-span-2" ref={zatcaRef} id="mesa-zatca-settings">
                <span>{t.zatcaEInvoice}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={envForced || !!hq.zatcaEnabled}
                  disabled={envForced}
                  className={`zk-user-switch${envForced || hq.zatcaEnabled ? ' on' : ''}`}
                  onClick={() => {
                    if (envForced) return
                    const next = !hq.zatcaEnabled
                    if (next && hq.taxId.replace(/\D/g, '').length < 10) {
                      flash(t.zatcaVatRequired, 'err')
                      return
                    }
                    patchHq('zatcaEnabled', next)
                  }}
                >
                  <i aria-hidden />
                  <strong>{t.zatcaEnable}</strong>
                </button>
                <small className="zk-co-hint">
                  {envForced ? t.zatcaEnvForced : t.zatcaHint}
                </small>
              </div>
              {(envForced || hq.zatcaEnabled) && (
                <>
                  <div className="zk-co-field zk-co-span-2">
                    <span>{t.zatcaPhase2}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={phase2Enabled}
                      className={`zk-user-switch${phase2Enabled ? ' on' : ''}`}
                      onClick={() => {
                        markDirty()
                        setPhase2Enabled((v) => !v)
                      }}
                    >
                      <i aria-hidden />
                      <strong>{t.zatcaPhase2Enable}</strong>
                    </button>
                    <small className="zk-co-hint">{t.zatcaPhase2Hint}</small>
                  </div>
                  {phase2Enabled ? (
                    <>
                      <label className="zk-co-field">
                        <span>{t.zatcaPhase2Env}</span>
                        <MesaSelect
                          value={phase2Env}
                          onChange={(v) => {
                            markDirty()
                            setPhase2Env(v === 'production' ? 'production' : 'sandbox')
                          }}
                          options={[
                            { value: 'sandbox', label: t.zatcaPhase2Sandbox },
                            { value: 'production', label: t.zatcaPhase2Production },
                          ]}
                        />
                      </label>
                      <div className="zk-co-field">
                        <span>{t.zatcaPhase2}</span>
                        <small className="zk-co-hint">
                          {proxyConfigured
                            ? `Proxy OK · CSID ${hasCsid ? '✓' : '—'} · Key ${hasPrivateKey ? '✓' : '—'} · Token ${hasBinaryToken ? '✓' : '—'}`
                            : `Sandbox local · CSID ${hasCsid ? '✓' : '—'} · Key ${hasPrivateKey ? '✓' : '—'} · Token ${hasBinaryToken ? '✓' : '—'}`}
                        </small>
                      </div>
                      <label className="zk-co-field zk-co-span-2">
                        <span>{t.zatcaCsid}</span>
                        <textarea
                          className="zk-co-input zk-co-textarea mesa-ltr-nums"
                          rows={3}
                          value={csid}
                          onChange={(e) => {
                            markDirty()
                            setCsid(e.target.value)
                          }}
                          placeholder={hasCsid ? '•••• stored on server — paste to replace' : '-----BEGIN CERTIFICATE-----'}
                        />
                      </label>
                      <label className="zk-co-field zk-co-span-2">
                        <span>{t.zatcaPrivateKey}</span>
                        <textarea
                          className="zk-co-input zk-co-textarea mesa-ltr-nums"
                          rows={3}
                          value={privateKey}
                          onChange={(e) => {
                            markDirty()
                            setPrivateKey(e.target.value)
                          }}
                          placeholder={hasPrivateKey ? '•••• stored on server — paste to replace' : '-----BEGIN EC PRIVATE KEY-----'}
                        />
                      </label>
                      <label className="zk-co-field zk-co-span-2">
                        <span>{t.zatcaBinaryToken}</span>
                        <input
                          className="zk-co-input mesa-ltr-nums"
                          value={binaryToken}
                          onChange={(e) => {
                            markDirty()
                            setBinaryToken(e.target.value)
                          }}
                          placeholder={hasBinaryToken ? '•••• stored on server — paste to replace' : ''}
                          autoComplete="off"
                        />
                        <small className="zk-co-hint">{t.zatcaCredsHint}</small>
                      </label>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="zk-co-panel zk-co-panel-branches">
          <div className="zk-co-panel-head">
            <div>
              <h2>{t.branches}</h2>
              <p>{t.branchesHint}</p>
            </div>
            <button type="button" className="zk-co-add" onClick={addBranch}>
              {t.addBranch}
            </button>
          </div>

          <div className="zk-co-split">
            <aside className="zk-co-list">
              {branchList.map((b) => {
                const selected = editing?.id === b.id
                const onTerminal = b.id === activeBranchId
                const unsaved = !branches.some((row) => row.id === b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`zk-co-branch${selected ? ' is-on' : ''}`}
                    onClick={() => setEditing(b)}
                  >
                    <span className="zk-co-branch-code">{b.code || '—'}</span>
                    <span className="zk-co-branch-copy">
                      <strong>
                        {unsaved
                          ? t.newBranch
                          : branchDisplayName(b, lang) || t.newBranch}
                      </strong>
                      <em className={onTerminal ? 'is-here' : undefined}>
                        {onTerminal ? t.thisTerminal : b.address || b.phone || '\u00a0'}
                      </em>
                    </span>
                    <span className={`zk-co-dot${b.active ? ' on' : ''}`} />
                  </button>
                )
              })}
            </aside>

            {editing ? (
              <div className="zk-co-form">
                <label className="zk-co-field">
                  <span>
                    {t.branchName} <i>*</i>
                  </span>
                  <input
                    className="zk-co-input"
                    value={editing.name}
                    onChange={(e) => patchBranch('name', e.target.value)}
                  />
                </label>
                <label className="zk-co-field">
                  <span>{t.branchNameAr}</span>
                  <ArabicTextInput
                    mode="ar"
                    showModeToggle={false}
                    className="zk-co-input"
                    value={editing.nameAr}
                    onChange={(nameAr) => patchBranch('nameAr', nameAr)}
                    suggestFrom={editing.name}
                  />
                </label>
                <label className="zk-co-field">
                  <span>
                    {t.branchCode} <i>*</i>
                  </span>
                  <input
                    className="zk-co-input mesa-ltr-nums"
                    value={editing.code}
                    onChange={(e) => patchBranch('code', e.target.value)}
                  />
                </label>
                <label className="zk-co-field">
                  <span>{t.phone}</span>
                  <input
                    className="zk-co-input mesa-ltr-nums"
                    value={editing.phone}
                    onChange={(e) => patchBranch('phone', e.target.value)}
                  />
                </label>
                <label className="zk-co-field zk-co-span-2">
                  <span>{t.address}</span>
                  <textarea
                    className="zk-co-input zk-co-area"
                    rows={2}
                    value={editing.address}
                    onChange={(e) => patchBranch('address', e.target.value)}
                  />
                </label>
                <label className="zk-co-field zk-co-span-2">
                  <span>{t.addressAr}</span>
                  <ArabicTextInput
                    multiline
                    rows={2}
                    mode="ar"
                    showModeToggle={false}
                    className="zk-co-input zk-co-area"
                    value={editing.addressAr}
                    onChange={(addressAr) => patchBranch('addressAr', addressAr)}
                    suggestFrom={editing.address}
                  />
                </label>
                <div className="zk-co-field">
                  <span>{t.branchActive}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editing.active}
                    className={`zk-user-switch${editing.active ? ' on' : ''}`}
                    onClick={() => patchBranch('active', !editing.active)}
                  >
                    <i aria-hidden />
                    <strong>{editing.active ? t.userActive : t.userInactive}</strong>
                  </button>
                </div>
                <div className="zk-co-form-actions">
                  <button
                    type="button"
                    className="zk-co-btn"
                    onClick={() => switchBranch(editing.id)}
                    disabled={!branches.some((b) => b.id === editing.id) || !editing.active}
                  >
                    {t.useOnTerminal}
                  </button>
                  <button
                    type="button"
                    className="zk-co-btn danger"
                    disabled={branches.length <= 1 || !branches.some((b) => b.id === editing.id)}
                    onClick={() => {
                      askDelete({
                        title: t.removeBranch,
                        name: editing.name || editing.code,
                        onConfirm: () => {
                          removeBranch(editing.id)
                          const next = branches.find((b) => b.id !== editing.id)
                          setEditing(next ?? null)
                        },
                      })
                    }}
                  >
                    {t.removeBranch}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <HubFooter
        actions={
          <div className="zk-company-foot-actions">
            <button type="button" className="zk-co-btn" onClick={cancel}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="zk-co-btn primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {t.update}
            </button>
          </div>
        }
      />

      {successOpen ? (
        <SuccessModal
          title={t.successTitle}
          message={t.companyUpdated}
          okLabel={t.ok}
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
