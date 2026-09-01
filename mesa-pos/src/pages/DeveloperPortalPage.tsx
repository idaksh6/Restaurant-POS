import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import MesaSelect from '../components/MesaSelect'
import { arabicToLatinName, latinToArabic } from '../lib/arabicTransliterate'
import { useAuth } from '../state/AuthContext'

type BranchRow = {
  id: string
  code: string
  name: string
  nameAr?: string | null
  address?: string | null
  addressAr?: string | null
  phone?: string | null
}

type UserRow = {
  id?: string
  username: string
  name: string
  nameAr?: string | null
  role?: string
}

type CompanyRow = {
  id: string
  companyName: string
  taxId: string | null
  aliasName?: string | null
  hqPhone?: string | null
  databaseName?: string
  branches: BranchRow[]
  users: UserRow[]
}

type EditBranch = {
  id: string
  name: string
  nameAr: string
  code: string
  address: string
  addressAr: string
  phone: string
}

type EditUser = {
  id: string
  name: string
  nameAr: string
  username: string
  password: string
  role: string
}

type Tab = 'companies' | 'register' | 'detail' | 'edit'

const API = () => (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const TOKEN_KEY = 'mesa-dev-portal-token'

const emptyForm = {
  companyName: '',
  aliasName: '',
  taxId: '',
  hqPhone: '',
  country: 'Saudi Arabia · SAR',
  branchName: '',
  branchNameAr: '',
  branchCode: '',
  branchAddress: '',
  branchAddressAr: '',
  branchPhone: '',
  adminName: '',
  adminNameAr: '',
  adminUsername: '',
  adminPassword: '',
}

const COUNTRY_OPTIONS = [
  { value: 'Saudi Arabia · SAR', label: 'Saudi Arabia (SAR)' },
  { value: 'United Arab Emirates · AED', label: 'United Arab Emirates (AED)' },
  { value: 'Kuwait · KWD', label: 'Kuwait (KWD)' },
  { value: 'Bahrain · BHD', label: 'Bahrain (BHD)' },
  { value: 'Qatar · QAR', label: 'Qatar (QAR)' },
  { value: 'Oman · OMR', label: 'Oman (OMR)' },
] as const

export default function DeveloperPortalPage() {
  const navigate = useNavigate()
  const { bindTerminal } = useAuth()
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [devUser, setDevUser] = useState('')
  const [devPass, setDevPass] = useState('')
  const [tab, setTab] = useState<Tab>('companies')
  const [form, setForm] = useState(emptyForm)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CompanyRow | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkEnAr, setLinkEnAr] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editCompany, setEditCompany] = useState({
    companyName: '',
    aliasName: '',
    taxId: '',
    hqPhone: '',
  })
  const [editBranches, setEditBranches] = useState<EditBranch[]>([])
  const [editUsers, setEditUsers] = useState<EditUser[]>([])

  const patch = <K extends keyof typeof emptyForm>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  function onCompanyName(value: string) {
    setForm((prev) => ({
      ...prev,
      companyName: value,
      aliasName: linkEnAr ? latinToArabic(value) : prev.aliasName,
    }))
  }

  function onAliasName(value: string) {
    setForm((prev) => ({
      ...prev,
      aliasName: value,
      companyName: linkEnAr ? arabicToLatinName(value) : prev.companyName,
    }))
  }

  function onBranchName(value: string) {
    setForm((prev) => ({
      ...prev,
      branchName: value,
      branchNameAr: linkEnAr ? latinToArabic(value) : prev.branchNameAr,
    }))
  }

  function onBranchNameAr(value: string) {
    setForm((prev) => ({
      ...prev,
      branchNameAr: value,
      branchName: linkEnAr ? arabicToLatinName(value) : prev.branchName,
    }))
  }

  function onBranchAddress(value: string) {
    setForm((prev) => ({
      ...prev,
      branchAddress: value,
      branchAddressAr: linkEnAr ? latinToArabic(value) : prev.branchAddressAr,
    }))
  }

  function onBranchAddressAr(value: string) {
    setForm((prev) => ({
      ...prev,
      branchAddressAr: value,
      branchAddress: linkEnAr ? arabicToLatinName(value) : prev.branchAddress,
    }))
  }

  function onAdminName(value: string) {
    setForm((prev) => ({
      ...prev,
      adminName: value,
      adminNameAr: linkEnAr ? latinToArabic(value) : prev.adminNameAr,
    }))
  }

  function onAdminNameAr(value: string) {
    setForm((prev) => ({
      ...prev,
      adminNameAr: value,
      adminName: linkEnAr ? arabicToLatinName(value) : prev.adminName,
    }))
  }
  const authHeaders = useCallback(
    (): HeadersInit =>
      token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
    [token],
  )

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setCompanies([])
    setDetail(null)
    setOk('')
    setError('')
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault()
    const base = API()
    if (!base) {
      setError('VITE_API_URL is not set')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${base}/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: devUser, password: devPass }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        accessToken?: string
        message?: string | string[]
      }
      if (!res.ok || !data.accessToken) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message
        throw new Error(msg || 'Login failed')
      }
      sessionStorage.setItem(TOKEN_KEY, data.accessToken)
      setToken(data.accessToken)
      setDevPass('')
      setTab('companies')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const load = useCallback(async () => {
    const base = API()
    if (!base || !token) return
    try {
      const res = await fetch(`${base}/dev/companies`, { headers: authHeaders() })
      if (res.status === 401) {
        logout()
        setError('Session expired — log in again')
        return
      }
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : `Request failed (${res.status})`
        throw new Error(msg)
      }
      setCompanies(payload as CompanyRow[])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load companies')
    }
  }, [token, authHeaders])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function useOnThisPos(company: {
    id: string
    companyName: string
    aliasName?: string | null
    taxId?: string | null
    hqPhone?: string | null
    branches?: BranchRow[]
  }) {
    await bindTerminal({
      id: company.id,
      companyName: company.companyName,
      aliasName: company.aliasName,
      taxId: company.taxId,
      hqPhone: company.hqPhone,
      branches: company.branches,
    })
    navigate('/')
  }

  async function openDetail(id: string) {
    const base = API()
    if (!base || !token) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${base}/dev/companies/${id}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(await res.text())
      setDetail((await res.json()) as CompanyRow)
      setSelectedId(id)
      setTab('detail')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load company')
    } finally {
      setBusy(false)
    }
  }

  async function openEdit(id: string) {
    const base = API()
    if (!base || !token) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      const res = await fetch(`${base}/dev/companies/${id}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(await res.text())
      const company = (await res.json()) as CompanyRow
      setEditId(company.id)
      setSelectedId(company.id)
      setEditCompany({
        companyName: company.companyName ?? '',
        aliasName: company.aliasName ?? '',
        taxId: company.taxId ?? '',
        hqPhone: company.hqPhone ?? '',
      })
      setEditBranches(
        (company.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name ?? '',
          nameAr: b.nameAr ?? '',
          code: b.code ?? '',
          address: b.address ?? '',
          addressAr: b.addressAr ?? '',
          phone: b.phone ?? '',
        })),
      )
      setEditUsers(
        (company.users ?? []).map((u) => ({
          id: u.id ?? '',
          name: u.name ?? '',
          nameAr: u.nameAr ?? '',
          username: u.username ?? '',
          password: '',
          role: u.role ?? 'admin',
        })),
      )
      setLinkEnAr(false)
      setTab('edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load company')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    const base = API()
    if (!base || !token || !editId) return
    setBusy(true)
    setOk('')
    setError('')
    try {
      const res = await fetch(`${base}/dev/companies/${editId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          ...editCompany,
          branches: editBranches,
          users: editUsers.map((u) => ({
            id: u.id,
            name: u.name,
            nameAr: u.nameAr,
            username: u.username,
            password: u.password.trim() || undefined,
          })),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string | string[]
        error?: string
        companyName?: string
      }
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || data.error || res.statusText
        throw new Error(msg)
      }
      setOk(`Saved ${data.companyName || editCompany.companyName}`)
      await load()
      await openDetail(editId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function register(e: React.FormEvent) {
    e.preventDefault()
    const base = API()
    if (!base || !token) return
    setBusy(true)
    setOk('')
    setError('')
    try {
      const res = await fetch(`${base}/dev/companies/register`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          enableTax: true,
          currency: form.country || 'Saudi Arabia · SAR',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string | string[]
        error?: string
        databaseName?: string
        company?: { companyName?: string; id?: string }
        branch?: { code?: string }
        admin?: { username?: string }
      }
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || data.error || res.statusText
        throw new Error(msg)
      }
      setOk(
        `Created ${data.company?.companyName} · DB ${data.databaseName || '—'} · branch ${data.branch?.code} · admin ${data.admin?.username}`,
      )
      setForm(emptyForm)
      setLinkEnAr(true)
      await load()
      if (data.company?.id) await openDetail(data.company.id)
      else setTab('companies')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Register failed')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="dev-shell">
        <div className="dev-login">
          <header className="dev-login-head">
            <div className="dev-mark">D</div>
            <div>
              <p className="dev-kicker">Mesa KSA</p>
              <h1>Developer</h1>
              <p>Sign in to manage companies</p>
            </div>
          </header>

          <form className="dev-form" onSubmit={(e) => void doLogin(e)}>
            {error ? <div className="dev-alert">{error}</div> : null}
            <label className="dev-field">
              <span>Username</span>
              <input
                autoComplete="username"
                value={devUser}
                onChange={(e) => setDevUser(e.target.value)}
                required
              />
            </label>
            <label className="dev-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={devPass}
                onChange={(e) => setDevPass(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="dev-btn primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <Link to="/" className="dev-btn ghost">
              Back to POS
            </Link>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="dev-shell dev-shell-app">
      <div className="dev-app">
        <header className="dev-top">
          <div className="dev-top-brand">
            <div className="dev-mark sm">D</div>
            <div>
              <strong>Developer portal</strong>
              <span>Companies · VAT · admin users</span>
            </div>
          </div>
          <div className="dev-top-actions">
            <Link to="/" className="dev-link">
              POS
            </Link>
            <button type="button" className="dev-btn ghost compact" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        <nav className="dev-tabs" aria-label="Portal sections">
          <button
            type="button"
            className={tab === 'companies' || tab === 'detail' || tab === 'edit' ? 'active' : ''}
            onClick={() => {
              setTab('companies')
              void load()
            }}
          >
            Companies
          </button>
          <button
            type="button"
            className={tab === 'register' ? 'active' : ''}
            onClick={() => setTab('register')}
          >
            Register
          </button>
        </nav>

        {error ? <div className="dev-alert">{error}</div> : null}
        {ok ? <div className="dev-alert ok">{ok}</div> : null}

        {tab === 'companies' ? (
          <section className="dev-panel">
            <div className="dev-panel-head">
              <h2>Companies ({companies.length})</h2>
              <button type="button" className="dev-btn ghost compact" onClick={() => void load()}>
                Refresh
              </button>
            </div>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>VAT</th>
                    <th>Database</th>
                    <th>Branches</th>
                    <th>Admins</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="dev-empty">
                        No companies yet. Use Register to add one.
                      </td>
                    </tr>
                  ) : (
                    companies.map((c) => (
                      <tr key={c.id} className={selectedId === c.id ? 'selected' : ''}>
                        <td>{c.companyName}</td>
                        <td className="mesa-ltr-nums">{c.taxId || '—'}</td>
                        <td className="mesa-ltr-nums">{c.databaseName || '—'}</td>
                        <td>{c.branches.map((b) => b.code).join(', ') || '—'}</td>
                        <td>{c.users.map((u) => u.username).join(', ') || '—'}</td>
                        <td>
                          <div className="dev-row-actions">
                            <button
                              type="button"
                              className="dev-link"
                              onClick={() => void openDetail(c.id)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="dev-link"
                              onClick={() => void openEdit(c.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="dev-link"
                              onClick={() => void useOnThisPos(c)}
                            >
                              Use on this POS
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'detail' && detail ? (
          <section className="dev-panel">
            <div className="dev-panel-head">
              <h2>{detail.companyName}</h2>
              <div className="dev-row-actions">
                <button
                  type="button"
                  className="dev-btn primary compact"
                  onClick={() => void useOnThisPos(detail)}
                >
                  Use on this POS
                </button>
                <button type="button" className="dev-btn ghost compact" onClick={() => void openEdit(detail.id)}>
                  Edit
                </button>
                <button type="button" className="dev-btn ghost compact" onClick={() => setTab('companies')}>
                  Back
                </button>
              </div>
            </div>
            <div className="dev-detail-grid">
              <div>
                <p className="dev-meta-label">VAT</p>
                <p className="mesa-ltr-nums">{detail.taxId || '—'}</p>
              </div>
              <div>
                <p className="dev-meta-label">Database</p>
                <p className="mesa-ltr-nums">{detail.databaseName || '—'}</p>
              </div>
              <div>
                <p className="dev-meta-label">HQ phone</p>
                <p className="mesa-ltr-nums">{detail.hqPhone || '—'}</p>
              </div>
              {detail.aliasName ? (
                <div>
                  <p className="dev-meta-label">Alias</p>
                  <p dir="rtl">{detail.aliasName}</p>
                </div>
              ) : null}
            </div>
            <h3>Branches</h3>
            <ul className="dev-list">
              {detail.branches.map((b) => (
                <li key={b.id}>
                  <strong>{b.code}</strong> {b.name}
                  {b.nameAr ? <span dir="rtl"> · {b.nameAr}</span> : null}
                </li>
              ))}
            </ul>
            <h3>Users</h3>
            <ul className="dev-list">
              {detail.users.map((u) => (
                <li key={u.username}>
                  {u.name} <span className="mesa-ltr-nums">@{u.username}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === 'edit' && editId ? (
          <form className="dev-panel" onSubmit={(e) => void saveEdit(e)}>
            <div className="dev-panel-head">
              <h2>Edit company</h2>
              <label className={`dev-link-toggle${linkEnAr ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={linkEnAr}
                  onChange={(e) => setLinkEnAr(e.target.checked)}
                />
                <span>{linkEnAr ? 'Auto convert EN ↔ AR' : 'Separate EN / AR names'}</span>
              </label>
            </div>
            <div className="dev-form-grid">
              <label className="dev-field">
                <span>Company name *</span>
                <input
                  required
                  value={editCompany.companyName}
                  onChange={(e) => {
                    const companyName = e.target.value
                    setEditCompany((prev) => ({
                      ...prev,
                      companyName,
                      aliasName: linkEnAr ? latinToArabic(companyName) : prev.aliasName,
                    }))
                  }}
                />
              </label>
              <label className="dev-field">
                <span>Alias (Arabic)</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="dev-ar-input"
                  value={editCompany.aliasName}
                  onChange={(aliasName) =>
                    setEditCompany((prev) => ({
                      ...prev,
                      aliasName,
                      companyName: linkEnAr ? arabicToLatinName(aliasName) : prev.companyName,
                    }))
                  }
                />
              </label>
              <label className="dev-field">
                <span>VAT / Tax ID *</span>
                <input
                  className="mesa-ltr-nums"
                  required
                  value={editCompany.taxId}
                  onChange={(e) => setEditCompany((prev) => ({ ...prev, taxId: e.target.value }))}
                />
              </label>
              <label className="dev-field">
                <span>HQ phone</span>
                <input
                  className="mesa-ltr-nums"
                  value={editCompany.hqPhone}
                  onChange={(e) => setEditCompany((prev) => ({ ...prev, hqPhone: e.target.value }))}
                />
              </label>
            </div>

            {editBranches.map((b, i) => (
              <div key={b.id} className="dev-edit-block">
                <h3>Branch {b.code || i + 1}</h3>
                <div className="dev-form-grid">
                  <label className="dev-field">
                    <span>Branch name *</span>
                    <input
                      required
                      value={b.name}
                      onChange={(e) => {
                        const name = e.target.value
                        setEditBranches((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? { ...row, name, nameAr: linkEnAr ? latinToArabic(name) : row.nameAr }
                              : row,
                          ),
                        )
                      }}
                    />
                  </label>
                  <label className="dev-field">
                    <span>Branch name (Arabic)</span>
                    <ArabicTextInput
                      mode="ar"
                      showModeToggle={false}
                      className="dev-ar-input"
                      value={b.nameAr}
                      onChange={(nameAr) =>
                        setEditBranches((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? {
                                  ...row,
                                  nameAr,
                                  name: linkEnAr ? arabicToLatinName(nameAr) : row.name,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="dev-field">
                    <span>Branch code *</span>
                    <input
                      className="mesa-ltr-nums"
                      required
                      value={b.code}
                      onChange={(e) =>
                        setEditBranches((prev) =>
                          prev.map((row, idx) => (idx === i ? { ...row, code: e.target.value } : row)),
                        )
                      }
                    />
                  </label>
                  <label className="dev-field">
                    <span>Branch phone</span>
                    <input
                      className="mesa-ltr-nums"
                      value={b.phone}
                      onChange={(e) =>
                        setEditBranches((prev) =>
                          prev.map((row, idx) => (idx === i ? { ...row, phone: e.target.value } : row)),
                        )
                      }
                    />
                  </label>
                  <label className="dev-field">
                    <span>Branch address</span>
                    <input
                      value={b.address}
                      onChange={(e) => {
                        const address = e.target.value
                        setEditBranches((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? {
                                  ...row,
                                  address,
                                  addressAr: linkEnAr ? latinToArabic(address) : row.addressAr,
                                }
                              : row,
                          ),
                        )
                      }}
                    />
                  </label>
                  <label className="dev-field">
                    <span>Branch address (Arabic)</span>
                    <ArabicTextInput
                      mode="ar"
                      showModeToggle={false}
                      className="dev-ar-input"
                      value={b.addressAr}
                      onChange={(addressAr) =>
                        setEditBranches((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? {
                                  ...row,
                                  addressAr,
                                  address: linkEnAr ? arabicToLatinName(addressAr) : row.address,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            ))}

            {editUsers.map((u, i) => (
              <div key={u.id || i} className="dev-edit-block">
                <h3>
                  {u.role === 'admin' ? 'Admin' : 'User'} @{u.username || i + 1}
                </h3>
                <div className="dev-form-grid">
                  <label className="dev-field">
                    <span>Display name *</span>
                    <input
                      required
                      value={u.name}
                      onChange={(e) => {
                        const name = e.target.value
                        setEditUsers((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? { ...row, name, nameAr: linkEnAr ? latinToArabic(name) : row.nameAr }
                              : row,
                          ),
                        )
                      }}
                    />
                  </label>
                  <label className="dev-field">
                    <span>Name (Arabic)</span>
                    <ArabicTextInput
                      mode="ar"
                      showModeToggle={false}
                      className="dev-ar-input"
                      value={u.nameAr}
                      onChange={(nameAr) =>
                        setEditUsers((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? {
                                  ...row,
                                  nameAr,
                                  name: linkEnAr ? arabicToLatinName(nameAr) : row.name,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="dev-field">
                    <span>Username *</span>
                    <input
                      className="mesa-ltr-nums"
                      required
                      value={u.username}
                      onChange={(e) =>
                        setEditUsers((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, username: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="dev-field">
                    <span>New password / PIN</span>
                    <input
                      className="mesa-ltr-nums"
                      type="password"
                      minLength={4}
                      value={u.password}
                      onChange={(e) =>
                        setEditUsers((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, password: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Leave blank to keep · PIN or password"
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="dev-actions">
              <button type="submit" className="dev-btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="dev-btn ghost" onClick={() => setTab('companies')}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {tab === 'register' ? (
          <form className="dev-panel" onSubmit={(e) => void register(e)}>
            <div className="dev-panel-head">
              <h2>Register company</h2>
              <label className={`dev-link-toggle${linkEnAr ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={linkEnAr}
                  onChange={(e) => setLinkEnAr(e.target.checked)}
                />
                <span>{linkEnAr ? 'Auto convert EN ↔ AR' : 'Separate EN / AR names'}</span>
              </label>
            </div>
            <div className="dev-form-grid">
              <label className="dev-field">
                <span>Company name *</span>
                <input
                  required
                  value={form.companyName}
                  onChange={(e) => onCompanyName(e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>Alias (Arabic)</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="dev-ar-input"
                  value={form.aliasName}
                  onChange={onAliasName}
                  placeholder={linkEnAr ? 'Auto from company name' : 'Type Arabic name'}
                />
              </label>
              <label className="dev-field">
                <span>VAT / Tax ID *</span>
                <input
                  className="mesa-ltr-nums"
                  required
                  value={form.taxId}
                  onChange={(e) => patch('taxId', e.target.value)}
                  placeholder="3xxxxxxxxxxxxxxx003"
                />
              </label>
              <label className="dev-field">
                <span>Country *</span>
                <MesaSelect
                  value={form.country}
                  onChange={(value) => patch('country', value)}
                  options={[...COUNTRY_OPTIONS]}
                  aria-label="Country"
                  placeholder="Select country"
                />
              </label>
              <label className="dev-field">
                <span>HQ phone</span>
                <input
                  className="mesa-ltr-nums"
                  value={form.hqPhone}
                  onChange={(e) => patch('hqPhone', e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>First branch name *</span>
                <input
                  required
                  value={form.branchName}
                  onChange={(e) => onBranchName(e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>Branch name (Arabic)</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="dev-ar-input"
                  value={form.branchNameAr}
                  onChange={onBranchNameAr}
                  placeholder={linkEnAr ? 'Auto from branch name' : 'Type Arabic name'}
                />
              </label>
              <label className="dev-field">
                <span>Branch code *</span>
                <input
                  className="mesa-ltr-nums"
                  required
                  value={form.branchCode}
                  onChange={(e) => patch('branchCode', e.target.value)}
                  placeholder="RYD-01"
                />
              </label>
              <label className="dev-field">
                <span>Branch phone</span>
                <input
                  className="mesa-ltr-nums"
                  value={form.branchPhone}
                  onChange={(e) => patch('branchPhone', e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>Branch address</span>
                <input
                  value={form.branchAddress}
                  onChange={(e) => onBranchAddress(e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>Branch address (Arabic)</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="dev-ar-input"
                  value={form.branchAddressAr}
                  onChange={onBranchAddressAr}
                  placeholder={linkEnAr ? 'Auto from address' : 'Type Arabic address'}
                />
              </label>
              <label className="dev-field">
                <span>Admin display name *</span>
                <input
                  required
                  value={form.adminName}
                  onChange={(e) => onAdminName(e.target.value)}
                />
              </label>
              <label className="dev-field">
                <span>Admin name (Arabic)</span>
                <ArabicTextInput
                  mode="ar"
                  showModeToggle={false}
                  className="dev-ar-input"
                  value={form.adminNameAr}
                  onChange={onAdminNameAr}
                  placeholder={linkEnAr ? 'Auto from display name' : 'Type Arabic name'}
                />
              </label>
              <label className="dev-field">
                <span>Admin username *</span>
                <input
                  className="mesa-ltr-nums"
                  required
                  value={form.adminUsername}
                  onChange={(e) => patch('adminUsername', e.target.value)}
                  placeholder="acme.admin"
                />
              </label>
              <label className="dev-field">
                <span>Admin password / PIN *</span>
                <input
                  className="mesa-ltr-nums"
                  required
                  type="password"
                  minLength={4}
                  value={form.adminPassword}
                  onChange={(e) => patch('adminPassword', e.target.value)}
                  placeholder="PIN digits or any password"
                />
              </label>
            </div>
            <div className="dev-actions">
              <button type="submit" className="dev-btn primary" disabled={busy}>
                {busy ? 'Provisioning…' : 'Create company'}
              </button>
              <button type="button" className="dev-btn ghost" onClick={() => setTab('companies')}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
