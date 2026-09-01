import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ArabicTextInput from '../components/ArabicTextInput'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import { money } from '../data/mock'
import { localeTag, useI18n, type Lang } from '../locale/i18n'
import { useCrm, POINTS_PER_SAR, SAR_PER_POINT, type CrmCustomer } from '../state/CrmContext'
import { usePos } from '../state/PosContext'

const PAGE_SIZE = 10

type FormState = {
  name: string
  phone: string
  address: string
  email: string
}

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  address: '',
  email: '',
})

function formatLastVisit(value: string, lang: Lang, today: string, yesterday: string, never: string) {
  if (!value || value === '—') return never
  if (value === 'Today') return today
  if (value === 'Yesterday') return yesterday
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const start = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((start(new Date()) - start(d)) / 86400000)
  if (diff === 0) return today
  if (diff === 1) return yesterday
  return d.toLocaleDateString(localeTag(lang), { day: '2-digit', month: 'short', year: 'numeric' })
}

function CrmIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="crm-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconUsers() {
  return (
    <CrmIcon>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c1-3.2 3.4-5 6-5s5 1.8 6 5" />
      <path d="M14.5 19c.6-2 2-3.2 3.5-3.2 1.2 0 2.3.7 3 2" />
    </CrmIcon>
  )
}

function IconStar() {
  return (
    <CrmIcon>
      <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8L12 3Z" />
    </CrmIcon>
  )
}

function IconRepeat() {
  return (
    <CrmIcon>
      <path d="M17 2v4h4" />
      <path d="M7 22v-4H3" />
      <path d="M20.5 8A8 8 0 0 0 7 5.3M3.5 16A8 8 0 0 0 17 18.7" />
    </CrmIcon>
  )
}

function IconPlus() {
  return (
    <CrmIcon>
      <path d="M12 5v14M5 12h14" />
    </CrmIcon>
  )
}

function IconSearch() {
  return (
    <CrmIcon>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </CrmIcon>
  )
}

function IconEdit() {
  return (
    <CrmIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </CrmIcon>
  )
}

function formFromCustomer(c: CrmCustomer): FormState {
  return {
    name: c.name,
    phone: c.phone,
    address: c.address ?? '',
    email: c.email ?? '',
  }
}

function formsEqual(a: FormState, b: FormState) {
  return (
    a.name === b.name &&
    a.phone === b.phone &&
    a.address === b.address &&
    a.email === b.email
  )
}

export default function CrmPage() {
  const { customers, upsertCustomer } = useCrm()
  const { flash } = usePos()
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [baseline, setBaseline] = useState<FormState>(emptyForm)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\s/g, '')
    const list = !q
      ? customers
      : customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.replace(/\s/g, '').includes(digits) ||
            (c.email ?? '').toLowerCase().includes(q) ||
            (c.address ?? '').toLowerCase().includes(q),
        )
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [customers, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [query])

  const editingCustomer = editingId ? (customers.find((c) => c.id === editingId) ?? null) : null
  const isNew = modalOpen && !editingId
  const dirty = modalOpen && !formsEqual(form, baseline)

  const totals = useMemo(
    () => ({
      points: customers.reduce((s, c) => s + c.points, 0),
      repeat: customers.filter((c) => c.visits >= 2).length,
    }),
    [customers],
  )

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function confirmLeave() {
    if (!dirty) return true
    return window.confirm('Discard unsaved changes?')
  }

  function openNew() {
    if (modalOpen && !confirmLeave()) return
    setEditingId(null)
    const next = emptyForm()
    setForm(next)
    setBaseline(next)
    setModalOpen(true)
  }

  function openEdit(c: CrmCustomer) {
    if (modalOpen && editingId === c.id) return
    if (modalOpen && !confirmLeave()) return
    setEditingId(c.id)
    const next = formFromCustomer(c)
    setForm(next)
    setBaseline(next)
    setModalOpen(true)
  }

  function closeModal() {
    if (!confirmLeave()) return
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setBaseline(emptyForm())
  }

  function save() {
    if (!form.name.trim()) {
      flash(t.nameRequired, 'err')
      return
    }
    if (!form.phone.trim()) {
      flash(t.phoneRequired, 'err')
      return
    }
    const phoneKey = form.phone.replace(/\s/g, '')
    const dup = customers.find(
      (c) => c.phone.replace(/\s/g, '') === phoneKey && c.id !== editingId,
    )
    if (dup) {
      flash(`Phone already used by ${dup.name}`, 'err')
      return
    }
    const wasNew = isNew
    const saved = upsertCustomer({
      id: wasNew ? undefined : editingId ?? undefined,
      name: form.name,
      phone: form.phone,
      address: form.address,
      email: form.email,
    })
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setBaseline(emptyForm())
    flash(wasNew ? `${t.customerSaved} · ${saved.name}` : t.customerSaved)
  }

  const last = (value: string) => formatLastVisit(value, lang, t.today, t.yesterday, t.never)

  return (
    <div className="zk-crm-desk">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      <div className="crm-page-inner">
        <header className="crm-hero">
          <div className="crm-hero-brand">
            <span className="crm-hero-mark">
              <IconUsers />
            </span>
            <div>
              <h1>{t.crm}</h1>
              <p>{t.crmHint}</p>
            </div>
          </div>
          <div className="crm-hero-stats">
            <span className="crm-stat tone-people">
              <IconUsers />
              <strong className="mesa-ltr-nums">{customers.length}</strong>
              <em>{t.customersCount}</em>
            </span>
            <span className="crm-stat tone-points">
              <IconStar />
              <strong className="mesa-ltr-nums">{totals.points}</strong>
              <em>{t.loyaltyPoints}</em>
            </span>
            <span className="crm-stat tone-repeat">
              <IconRepeat />
              <strong className="mesa-ltr-nums">{totals.repeat}</strong>
              <em>{t.repeatGuests}</em>
            </span>
            <span className="crm-stat tone-rate">
              <strong className="mesa-ltr-nums">
                {POINTS_PER_SAR} pt/SAR · {SAR_PER_POINT} SAR/pt
              </strong>
              <em>{t.earnRedeem}</em>
            </span>
          </div>
          <div className="crm-hero-actions">
            <button type="button" className="crm-link-btn primary" onClick={openNew}>
              <IconPlus /> {t.addCustomer}
            </button>
          </div>
        </header>

        <section className="crm-board">
          <div className="crm-toolbar">
            <label className="crm-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchCustomer}
                aria-label={t.searchCustomer}
              />
            </label>
            <span className="crm-count mesa-ltr-nums">
              {filtered.length} / {customers.length}
            </span>
            <button type="button" className="crm-add-btn" onClick={openNew}>
              <IconPlus /> {t.addCustomer}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="crm-empty">
              <strong>{t.noCustomers}</strong>
              <p>{query ? 'Try another search.' : t.crmHint}</p>
              <button type="button" className="crm-add-btn" onClick={openNew}>
                <IconPlus /> {t.addCustomer}
              </button>
            </div>
          ) : (
            <>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <colgroup>
                    <col className="crm-col-name" />
                    <col className="crm-col-phone" />
                    <col className="crm-col-visits" />
                    <col className="crm-col-spend" />
                    <col className="crm-col-points" />
                    <col className="crm-col-visit" />
                    <col className="crm-col-action" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.phone}</th>
                      <th>{t.visits}</th>
                      <th>{t.lifetimeSpend}</th>
                      <th>{t.points}</th>
                      <th>{t.lastVisit}</th>
                      <th aria-label={t.actions} />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((c) => (
                      <tr key={c.id} onDoubleClick={() => openEdit(c)}>
                        <td>
                          <div className="crm-name">
                            <span className="crm-avatar" aria-hidden>
                              {(c.name.trim()[0] || 'C').toUpperCase()}
                            </span>
                            <div className="crm-name-text">
                              <strong title={c.name}>{c.name}</strong>
                              {c.email ? <span title={c.email}>{c.email}</span> : null}
                            </div>
                          </div>
                        </td>
                        <td className="mesa-ltr-nums">{c.phone || '—'}</td>
                        <td className="mesa-ltr-nums">{c.visits}</td>
                        <td className="mesa-ltr-nums">{money(c.spent)}</td>
                        <td>
                          <span className="crm-points-chip mesa-ltr-nums">{c.points} pts</span>
                        </td>
                        <td>{last(c.lastVisit)}</td>
                        <td>
                          <div className="crm-row-actions">
                            <button
                              type="button"
                              className="crm-icon-btn"
                              title={t.editCustomer}
                              aria-label={`${t.editCustomer} ${c.name}`}
                              onClick={() => openEdit(c)}
                            >
                              <IconEdit />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="crm-pager">
                <span className="mesa-ltr-nums">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="crm-pager-actions">
                  <button
                    type="button"
                    className="crm-page-btn"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`crm-page-btn${n === safePage ? ' on' : ''}`}
                      onClick={() => setPage(n)}
                      aria-current={n === safePage ? 'page' : undefined}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="crm-page-btn"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="crm-notes">
            <div>
              <strong>{t.earnOnSettle}</strong>
              <span>{t.earnOnSettleHint}</span>
            </div>
            <div>
              <strong>{t.redeemAtSettle}</strong>
              <span>{t.redeemAtSettleHint}</span>
            </div>
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div
          className="modal-backdrop crm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="modal-card crm-modal">
            <div className="crm-modal-head">
              <div>
                <h2>{isNew ? t.newCustomer : t.editCustomer}</h2>
                {editingCustomer ? (
                  <p>
                    {t.lastVisit}: {last(editingCustomer.lastVisit)}
                    {dirty ? ' · Unsaved' : ''}
                  </p>
                ) : (
                  <p>Fill name and phone, then save</p>
                )}
              </div>
              <button type="button" className="crm-btn ghost" onClick={closeModal}>
                {t.close}
              </button>
            </div>

            {editingCustomer ? (
              <div className="crm-kpis">
                <div>
                  <span>{t.visits}</span>
                  <strong className="mesa-ltr-nums">{editingCustomer.visits}</strong>
                </div>
                <div>
                  <span>{t.lifetimeSpend}</span>
                  <strong className="mesa-ltr-nums">{money(editingCustomer.spent)}</strong>
                </div>
                <div>
                  <span>{t.points}</span>
                  <strong className="mesa-ltr-nums">{editingCustomer.points}</strong>
                </div>
              </div>
            ) : null}

            <div className="crm-form">
              <label className="crm-field">
                <span>
                  {t.name} <i>*</i>
                </span>
                <ArabicTextInput
                  mode="auto"
                  showModeToggle={false}
                  className="crm-input"
                  value={form.name}
                  onChange={(name) => patch('name', name)}
                />
              </label>
              <label className="crm-field">
                <span>
                  {t.phone} <i>*</i>
                </span>
                <input
                  className="crm-input mesa-ltr-nums"
                  value={form.phone}
                  onChange={(e) => patch('phone', e.target.value)}
                  placeholder="+966 …"
                />
              </label>
              <label className="crm-field crm-span-2">
                <span>{t.address}</span>
                <ArabicTextInput
                  mode="auto"
                  showModeToggle={false}
                  className="crm-input"
                  value={form.address}
                  onChange={(address) => patch('address', address)}
                />
              </label>
              <label className="crm-field crm-span-2">
                <span>{t.email}</span>
                <input
                  className="crm-input mesa-ltr-nums"
                  type="email"
                  value={form.email}
                  onChange={(e) => patch('email', e.target.value)}
                  placeholder="optional"
                />
              </label>
            </div>

            <div className="crm-modal-actions">
              <button type="button" className="crm-btn ghost" onClick={closeModal}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="crm-btn primary"
                disabled={!dirty && !isNew}
                onClick={save}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo="/" backLabel={t.home} />
    </div>
  )
}
