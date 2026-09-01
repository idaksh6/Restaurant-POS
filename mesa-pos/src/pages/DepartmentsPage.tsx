import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import { getActiveBranchId } from '../data/company'
import type { MenuCategory } from '../data/masters'
import { useAuth } from '../state/AuthContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

const PALETTE = [
  '#c45c26',
  '#1f6b5c',
  '#2aa35f',
  '#b7791f',
  '#1c7ed6',
  '#e03131',
  '#5f3dc4',
  '#212529',
  '#f08c00',
  '#0ca678',
  '#7048e8',
  '#e8590c',
]

const FONT_PALETTE = ['#ffffff', '#f8f9fa', '#212529', '#12201c', '#ffe8cc', '#e7f5ff']

function clampNum(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function normalizeHex(value: string, fallback: string) {
  const raw = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`
  return fallback
}

const emptyDept = (sort: number): MenuCategory => ({
  id: `cat-${Date.now()}`,
  name: '',
  alias: '',
  sort,
  active: true,
  parentId: undefined,
  isBar: false,
  buttonColor: '#c45c26',
  buttonHeight: 100,
  buttonFontSize: 14,
  productButtonColor: '#2aa35f',
  productButtonHeight: 100,
  productButtonFontSize: 14,
  deptFontColor: '#ffffff',
  productFontColor: '#212529',
  branchId: getActiveBranchId(),
})

function NumStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (n: number) => void
  'aria-label'?: string
}) {
  return (
    <div className="zk-dept-stepper">
      <button
        type="button"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(clampNum(value - step, min, max))}
      >
        −
      </button>
      <input
        className="mesa-ltr-nums"
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          onChange(clampNum(n, min, max))
        }}
      />
      <button
        type="button"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(clampNum(value + step, min, max))}
      >
        +
      </button>
    </div>
  )
}

function ColorField({
  label,
  value,
  fallback,
  swatches,
  onChange,
}: {
  label: string
  value: string
  fallback: string
  swatches: string[]
  onChange: (hex: string) => void
}) {
  const hex = normalizeHex(value, fallback)
  const [draft, setDraft] = useState(hex)

  useEffect(() => {
    setDraft(hex)
  }, [hex])

  return (
    <div className="zk-dept-color-field">
      <span>{label}</span>
      <div className="zk-dept-color-row">
        <label className="zk-dept-color-pick" title={hex}>
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(normalizeHex(e.target.value, fallback))}
          />
        </label>
        <input
          className="zk-dept-hex mesa-ltr-nums"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            if (!/^#[0-9a-fA-F]{0,6}$/.test(next)) return
            setDraft(next)
            if (next.length === 7) onChange(next.toLowerCase())
          }}
          onBlur={() => {
            const fixed = normalizeHex(draft, fallback)
            setDraft(fixed)
            onChange(fixed)
          }}
        />
        <div className="zk-dept-swatches compact">
          {swatches.map((c) => (
            <button
              key={`${label}-${c}`}
              type="button"
              className={hex.toLowerCase() === c.toLowerCase() ? 'on' : ''}
              style={{ background: c }}
              onClick={() => onChange(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ButtonStyleCard({
  title,
  sample,
  height,
  fontSize,
  bg,
  fg,
  onHeight,
  onFontSize,
  onBg,
  onFg,
  heightLabel,
  fontSizeLabel,
  bgLabel,
  fgLabel,
}: {
  title: string
  sample: string
  height: number
  fontSize: number
  bg: string
  fg: string
  onHeight: (n: number) => void
  onFontSize: (n: number) => void
  onBg: (hex: string) => void
  onFg: (hex: string) => void
  heightLabel: string
  fontSizeLabel: string
  bgLabel: string
  fgLabel: string
}) {
  return (
    <section className="zk-dept-section zk-dept-style-panel">
      <div className="zk-dept-style-top">
        <h3>{title}</h3>
        <div
          className="zk-dept-mini-preview"
          style={{
            background: bg,
            color: fg,
            height: `${clampNum(height * 0.55, 40, 72)}px`,
            fontSize: `${clampNum(fontSize, 11, 22)}px`,
          }}
        >
          {sample || 'Aa'}
        </div>
      </div>

      <div className="zk-dept-metrics">
        <label>
          <span>{heightLabel}</span>
          <NumStepper
            aria-label={heightLabel}
            value={height}
            min={48}
            max={180}
            step={4}
            onChange={onHeight}
          />
        </label>
        <label>
          <span>{fontSizeLabel}</span>
          <NumStepper
            aria-label={fontSizeLabel}
            value={fontSize}
            min={10}
            max={28}
            step={1}
            onChange={onFontSize}
          />
        </label>
      </div>

      <ColorField
        label={bgLabel}
        value={bg}
        fallback="#c45c26"
        swatches={PALETTE}
        onChange={onBg}
      />
      <ColorField
        label={fgLabel}
        value={fg}
        fallback="#ffffff"
        swatches={FONT_PALETTE}
        onChange={onFg}
      />
    </section>
  )
}

export default function DepartmentsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { runSync } = useSync()
  const { categories, dishes, saveCategory, deleteCategory } = useMasters()
  const fileRef = useRef<HTMLInputElement>(null)

  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<'all' | string>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<MenuCategory | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()


  const mains = useMemo(
    () => categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const subs = useMemo(
    () => categories.filter((c) => c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = categories
    if (selectedId !== 'all') {
      rows = rows.filter(
        (c) => c.id === selectedId || c.parentId === selectedId,
      )
    }
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.alias ?? '').toLowerCase().includes(q),
      )
    }
    return [...rows].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  }, [categories, selectedId, query])

  const linkedProducts = useMemo(() => {
    if (!editing) return 0
    return dishes.filter((d) => d.categoryId === editing.id).length
  }, [dishes, editing])

  const childDepts = useMemo(() => {
    if (!editing) return 0
    return categories.filter((c) => c.parentId === editing.id).length
  }, [categories, editing])

  function startAdd() {
    const nextSort = Math.max(0, ...categories.map((c) => c.sort)) + 1
    setIsNew(true)
    setEditing(emptyDept(nextSort))
  }

  function startEdit(cat: MenuCategory) {
    setIsNew(false)
    setEditing({
      ...cat,
      alias: cat.alias ?? '',
      buttonColor: cat.buttonColor ?? '#c45c26',
      productButtonColor: cat.productButtonColor ?? '#2aa35f',
      deptFontColor: cat.deptFontColor ?? '#ffffff',
      productFontColor: cat.productFontColor ?? '#212529',
      buttonHeight: cat.buttonHeight ?? 100,
      buttonFontSize: cat.buttonFontSize ?? 14,
      productButtonHeight: cat.productButtonHeight ?? 100,
      productButtonFontSize: cat.productButtonFontSize ?? 14,
    })
  }

  function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash(t.deptNameRequired)
      return
    }
    if (editing.parentId === editing.id) {
      flash(t.deptOwnParent)
      return
    }
    saveCategory({
      ...editing,
      name: editing.name.trim(),
      alias: (editing.alias ?? '').trim(),
      sort: Number(editing.sort) || 0,
    })
    setEditing(null)
    flash(isNew ? t.deptSaved : t.deptUpdated)
  }

  function remove() {
    if (!editing || isNew) return
    if (linkedProducts > 0 || childDepts > 0) {
      flash(t.cannotDeleteDept)
      return
    }
    askDelete({
      name: editing.name,
      message: `${t.deleteDepartmentAsk} “${editing.name}”`,
      onConfirm: () => {
        void deleteCategory(editing.id).then(() => {
          setEditing(null)
          flash(t.deptDeleted)
          void runSync({ quiet: true }).catch(() => undefined)
        })
      },
    })
  }

  function onBrowse(file: File | undefined) {
    if (!editing || !file) return
    if (file.size > 150 * 1024) {
      flash(t.maxLogoSize)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setEditing({ ...editing, imageDataUrl: String(reader.result || '') })
    }
    reader.readAsDataURL(file)
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.deptLocked}</strong>
          {t.deptLockedHint}
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
    <div className="zk-dept">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-dept-bar">
        <h1>{t.departments}</h1>
        <HubAddButton onClick={startAdd} title={t.addDepartment} />
      </div>

      <div className="zk-dept-search">
        <label>
          {t.search}
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchDepartment}
          />
        </label>
        <span className="chip mesa-ltr-nums">{filtered.length} {t.deptsShort}</span>
      </div>

      <div className="zk-dept-body">
        <aside className="zk-dept-tree">
          <button
            type="button"
            className={`zk-tree-all${selectedId === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedId('all')}
          >
            {t.all}
          </button>
          {mains.map((main) => {
            const children = subs.filter((s) => s.parentId === main.id)
            const open = expanded[main.id] ?? true
            return (
              <div key={main.id} className="zk-tree-block">
                <div className="zk-tree-main">
                  <button
                    type="button"
                    className="zk-tree-toggle"
                    aria-label={open ? t.collapse : t.expand}
                    onClick={() => setExpanded((prev) => ({ ...prev, [main.id]: !open }))}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    className={`zk-tree-label${selectedId === main.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(main.id)}
                  >
                    {main.name}
                  </button>
                </div>
                {open ? (
                  <div className="zk-tree-subs">
                    {children.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className={selectedId === sub.id ? 'active' : ''}
                        onClick={() => setSelectedId(sub.id)}
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </aside>

        <section className="zk-dept-grid-wrap">
          {filtered.length === 0 ? (
            <div className="zk-dept-empty">
              <strong>{t.noDepartments}</strong>
              <span>{t.tapPlusDept}</span>
            </div>
          ) : (
            <div className="zk-dept-grid">
              {filtered.map((cat) => {
                const bg = cat.buttonColor ?? '#c45c26'
                const fg = cat.deptFontColor ?? '#fff'
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`zk-dept-tile${!cat.active ? ' inactive' : ''}`}
                    style={{
                      background: cat.imageDataUrl
                        ? `linear-gradient(180deg, rgba(18,32,28,0.15), rgba(18,32,28,0.72)), url(${cat.imageDataUrl}) center/cover`
                        : `linear-gradient(145deg, ${bg}, color-mix(in srgb, ${bg} 75%, #111))`,
                      color: fg,
                      minHeight: `${Math.max(88, (cat.buttonHeight ?? 100) * 0.9)}px`,
                      fontSize: `${cat.buttonFontSize ?? 14}px`,
                    }}
                    onClick={() => startEdit(cat)}
                  >
                    <strong>{cat.name}</strong>
                    {cat.parentId ? (
                      <small>
                        {categories.find((p) => p.id === cat.parentId)?.name ?? t.childDept}
                      </small>
                    ) : (
                      <small>{t.topLevel}</small>
                    )}
                    {!cat.active ? <em>{t.inactive}</em> : null}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <HubFooter backTo={settingsHubPath('products')} backLabel={t.products} />

      {editing ? (
        <div
          className="zk-dept-modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null)
          }}
        >
          <div className="zk-dept-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="zk-dept-sheet-head">
              <div>
                <p className="zk-dept-sheet-kicker">
                  {isNew ? t.newDepartment : t.editDepartment}
                </p>
                <h2>{editing.name.trim() || t.newDepartment}</h2>
              </div>
              <button
                type="button"
                className="zk-dept-sheet-close"
                aria-label={t.close}
                onClick={() => setEditing(null)}
              >
                ✕
              </button>
            </div>

            <div className="zk-dept-sheet-body">
              <section className="zk-dept-section">
                <h3>Details</h3>
                <div className="zk-dept-grid-2">
                  <label>
                    <span>
                      {t.name} <i>*</i>
                    </span>
                    <ArabicTextInput
                      className="search"
                      value={editing.name}
                      onChange={(name) => setEditing({ ...editing, name })}
                      mode="auto"
                      showModeToggle={false}
                    />
                  </label>
                  <label>
                    <span>{t.aliasName}</span>
                    <ArabicTextInput
                      className="search"
                      value={editing.alias ?? ''}
                      onChange={(alias) => setEditing({ ...editing, alias })}
                      mode="auto"
                      showModeToggle={false}
                    />
                  </label>
                  <label>
                    <span>{t.sortOrder}</span>
                    <input
                      className="search mesa-ltr-nums"
                      type="number"
                      value={editing.sort}
                      onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label>
                    <span>{t.status}</span>
                    <MesaSelect
                      value={editing.active ? 'active' : 'inactive'}
                      onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                      options={[
                        { value: 'active', label: t.userActive },
                        { value: 'inactive', label: t.inactive },
                      ]}
                    />
                  </label>
                  <label className="zk-dept-span-2">
                    <span>
                      {t.parentDepartment} <i>*</i>
                    </span>
                    <MesaSelect
                      value={editing.parentId ?? ''}
                      onChange={(v) =>
                        setEditing({
                          ...editing,
                          parentId: v || undefined,
                        })
                      }
                      options={[
                        { value: '', label: t.noneTopLevel },
                        ...mains
                          .filter((m) => m.id !== editing.id)
                          .map((m) => ({ value: m.id, label: m.name })),
                      ]}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className={`zk-dept-toggle${editing.isBar ? ' on' : ''}`}
                  onClick={() => setEditing({ ...editing, isBar: !editing.isBar })}
                >
                  <span className="zk-dept-toggle-dot" aria-hidden />
                  {t.typeBar}
                </button>
              </section>

              <div className="zk-dept-style-grid">
                <ButtonStyleCard
                  title={t.departmentButton}
                  sample={editing.name.trim() || t.preview}
                  height={editing.buttonHeight ?? 100}
                  fontSize={editing.buttonFontSize ?? 14}
                  bg={editing.buttonColor ?? '#c45c26'}
                  fg={editing.deptFontColor ?? '#ffffff'}
                  heightLabel={t.height}
                  fontSizeLabel={t.fontSize}
                  bgLabel={t.buttonBg}
                  fgLabel={t.fontColor}
                  onHeight={(n) => setEditing({ ...editing, buttonHeight: n })}
                  onFontSize={(n) => setEditing({ ...editing, buttonFontSize: n })}
                  onBg={(hex) => setEditing({ ...editing, buttonColor: hex })}
                  onFg={(hex) => setEditing({ ...editing, deptFontColor: hex })}
                />
                <ButtonStyleCard
                  title={t.productButton}
                  sample={editing.name.trim() || t.preview}
                  height={editing.productButtonHeight ?? 100}
                  fontSize={editing.productButtonFontSize ?? 14}
                  bg={editing.productButtonColor ?? '#2aa35f'}
                  fg={editing.productFontColor ?? '#212529'}
                  heightLabel={t.height}
                  fontSizeLabel={t.fontSize}
                  bgLabel={t.buttonBg}
                  fgLabel={t.fontColor}
                  onHeight={(n) => setEditing({ ...editing, productButtonHeight: n })}
                  onFontSize={(n) => setEditing({ ...editing, productButtonFontSize: n })}
                  onBg={(hex) => setEditing({ ...editing, productButtonColor: hex })}
                  onFg={(hex) => setEditing({ ...editing, productFontColor: hex })}
                />
              </div>

              <section className="zk-dept-section zk-dept-preview-section">
                <h3>{t.preview}</h3>
                <div className="zk-dept-dual-preview">
                  <div
                    className="zk-dept-preview"
                    style={
                      editing.imageDataUrl
                        ? { backgroundImage: `url(${editing.imageDataUrl})` }
                        : {
                            background: editing.buttonColor ?? '#c45c26',
                            color: editing.deptFontColor ?? '#fff',
                            minHeight: `${clampNum(editing.buttonHeight ?? 100, 72, 180)}px`,
                            fontSize: `${editing.buttonFontSize ?? 14}px`,
                          }
                    }
                  >
                    {!editing.imageDataUrl ? (
                      <span>{editing.name.trim() || t.departmentButton}</span>
                    ) : null}
                  </div>
                  <div
                    className="zk-dept-preview product"
                    style={{
                      background: editing.productButtonColor ?? '#2aa35f',
                      color: editing.productFontColor ?? '#212529',
                      minHeight: `${clampNum(editing.productButtonHeight ?? 100, 72, 180)}px`,
                      fontSize: `${editing.productButtonFontSize ?? 14}px`,
                    }}
                  >
                    <span>{editing.name.trim() || t.productButton}</span>
                  </div>
                </div>
                <div className="zk-dept-image-actions row">
                  <button
                    type="button"
                    className="zk-dept-action"
                    onClick={() => fileRef.current?.click()}
                  >
                    {t.browse}
                  </button>
                  <button
                    type="button"
                    className="zk-dept-action danger"
                    disabled={!editing.imageDataUrl}
                    onClick={() => setEditing({ ...editing, imageDataUrl: undefined })}
                  >
                    {t.delete}
                  </button>
                  <small>{t.maxLogoSize}</small>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onBrowse(e.target.files?.[0])}
                  />
                </div>
              </section>
            </div>

            <div className="zk-dept-actions">
              <button type="button" className="zk-dept-action" onClick={() => setEditing(null)}>
                {t.cancel}
              </button>
              {!isNew ? (
                <button type="button" className="zk-dept-action danger" onClick={remove}>
                  {t.delete}
                </button>
              ) : null}
              <button type="button" className="zk-dept-action primary" onClick={save}>
                {isNew ? t.save : t.update}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
