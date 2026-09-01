import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { getActiveBranchId } from '../data/company'
import {
  PAPER_WIDTH_PRESETS,
  PRINT_TEMPLATES,
  normalizeTemplateId,
  templateLabel,
  templatesForKind,
  type PrintTemplateId,
} from '../data/printTemplates'
import { type PrintKind, type PrintStation } from '../data/printers'
import { hasNativePrintBridge, listOsPrinters, previewSlipHtml, type OsPrinter } from '../hardware/printer'
import { settingsHubPath } from '../lib/settingsHub'
import { messages, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

type Focus = 'receipt' | 'kot' | 'map' | 'template'

function parseFocus(value: string | null): Focus {
  if (value === 'kot' || value === 'map' || value === 'template') return value
  return 'receipt'
}

function blank(kind: PrintKind, sort: number): PrintStation {
  return {
    id: `prn-${kind}-${Date.now()}`,
    branchId: getActiveBranchId(),
    kind,
    name: kind === 'kot' ? 'Kitchen' : 'Front receipt',
    target: 'browser',
    copies: 1,
    paperWidthMm: 80,
    templateId: kind === 'kot' ? 'kitchen' : 'classic',
    header: kind === 'receipt' ? 'MESA' : '',
    footer: kind === 'receipt' ? messages().printThanks : '',
    active: true,
    sort,
  }
}

function deptLabel(
  categories: { id: string; name: string }[],
  departmentId?: string,
) {
  if (!departmentId) return 'All departments'
  return categories.find((c) => c.id === departmentId)?.name ?? 'Unknown department'
}

export default function PrintersPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { lang } = useI18n()
  const { activeBranchId } = useBranch()
  const { categories } = useMasters()
  const { printStations: rows, savePrintStation, deletePrintStation } = useCatalog()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [searchParams, setSearchParams] = useSearchParams()
  const focus = parseFocus(searchParams.get('focus'))
  const [editing, setEditing] = useState<PrintStation | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [previewing, setPreviewing] = useState<PrintStation | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [osPrinters, setOsPrinters] = useState<OsPrinter[]>([])
  const nativeBridge = hasNativePrintBridge()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const listKind: PrintKind = focus === 'kot' || focus === 'map' ? 'kot' : 'receipt'

  useEffect(() => {
    if (!nativeBridge) return
    let cancelled = false
    void listOsPrinters().then((rows) => {
      if (!cancelled) setOsPrinters(rows)
    })
    return () => {
      cancelled = true
    }
  }, [nativeBridge])

  const targetOptions = useMemo(() => {
    const opts = [{ value: 'browser', label: nativeBridge ? 'Browser / print dialog' : 'browser' }]
    for (const p of osPrinters) {
      const name = p.name || p.displayName
      if (!name || opts.some((o) => o.value === name)) continue
      opts.push({
        value: name,
        label: p.isDefault ? `${p.displayName || name} (default)` : p.displayName || name,
      })
    }
    if (editing?.target && !opts.some((o) => o.value === editing.target)) {
      opts.push({ value: editing.target, label: editing.target })
    }
    return opts
  }, [osPrinters, editing?.target, nativeBridge])

  const shown = useMemo(
    () =>
      [...rows.filter((r) => r.kind === listKind)].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name),
      ),
    [rows, listKind],
  )

  const unmappedDepts = useMemo(() => {
    if (focus !== 'map') return []
    const mapped = new Set(shown.map((p) => p.departmentId).filter(Boolean))
    return categories.filter((c) => c.active !== false && !mapped.has(c.id))
  }, [focus, shown, categories])

  useEffect(() => {
    setIsNew(false)
    setEditing(null)
    setPreviewing(null)
  }, [focus, activeBranchId])

  const title =
    focus === 'kot'
      ? 'KOT Printer'
      : focus === 'map'
        ? 'Printer Mapping'
        : focus === 'template'
          ? 'Print designs'
          : 'Receipt Printer'

  const subtitle =
    focus === 'kot'
      ? 'Kitchen printers for this branch. Route by department under Printer Mapping.'
      : focus === 'map'
        ? 'Assign KOT printers to departments so tickets print to the right kitchen.'
        : focus === 'template'
          ? 'Preview a design, then Edit to apply it on a receipt printer (header, footer, paper size).'
          : 'Front-of-house receipt printers for this branch.'

  function setFocus(next: Focus) {
    setSearchParams(next === 'receipt' ? {} : { focus: next }, { replace: true })
  }

  function openEditor(row: PrintStation, asNew = false) {
    setIsNew(asNew)
    setEditing({
      ...row,
      paperWidthMm: Number(row.paperWidthMm) || 80,
      copies: Math.max(1, Number(row.copies) || 1),
      templateId: normalizeTemplateId(row.templateId, listKind),
    })
  }

  function closeEditor() {
    setEditing(null)
    setIsNew(false)
  }

  function openPreview(row: PrintStation) {
    setPreviewing({
      ...row,
      paperWidthMm: Number(row.paperWidthMm) || 80,
      templateId: normalizeTemplateId(row.templateId, listKind),
    })
  }

  function closePreview() {
    setPreviewing(null)
  }

  function openDesignPreview(templateId: PrintTemplateId) {
    const base =
      shown.find((r) => r.active) ||
      shown[0] ||
      blank('receipt', Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1)
    openPreview({
      ...base,
      templateId,
      paperWidthMm: Number(base.paperWidthMm) || 80,
      header: base.header || 'MESA',
      footer: base.footer || messages().printThanks,
    })
  }

  function editDesign(templateId: PrintTemplateId) {
    const base = shown.find((r) => r.active) || shown[0]
    if (!base) {
      const row = blank('receipt', Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1)
      row.templateId = templateId
      openEditor(row, true)
      flash('Create this receipt printer, then save to use the design')
      return
    }
    openEditor({ ...base, templateId })
  }

  function startNew() {
    if (focus === 'template') {
      const row = blank('receipt', Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1)
      openEditor(row, true)
      return
    }
    const kind: PrintKind = focus === 'map' || focus === 'kot' ? 'kot' : 'receipt'
    const row = blank(kind, Math.max(0, ...shown.map((r) => r.sort ?? 0)) + 1)
    if (focus === 'map' && unmappedDepts[0]) {
      row.departmentId = unmappedDepts[0].id
      row.name = `${unmappedDepts[0].name} KOT`
    }
    openEditor(row, true)
  }

  function save() {
    if (!editing?.name.trim()) {
      flash('Printer name is required')
      return
    }
    const row: PrintStation = {
      ...editing,
      branchId: editing.branchId ?? activeBranchId,
      kind: listKind,
      name: editing.name.trim(),
      target: editing.target.trim() || 'browser',
      copies: Math.max(1, Number(editing.copies) || 1),
      paperWidthMm: Number(editing.paperWidthMm) || 80,
      templateId: normalizeTemplateId(editing.templateId, listKind),
      departmentId: listKind === 'kot' ? editing.departmentId || undefined : undefined,
      header: editing.header ?? '',
      footer: editing.footer ?? '',
    }
    savePrintStation(row)
    closeEditor()
    setSuccessMsg(isNew ? 'Printer saved' : 'Printer updated')
    flash(isNew ? 'Printer saved' : 'Printer updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deletePrintStation(editing.id)
        closeEditor()
        flash('Printer removed')
      },
    })
  }

  const showAdd = focus !== 'template' || shown.length === 0
  const formTitle =
    focus === 'template'
      ? isNew
        ? 'New receipt template'
        : 'Edit print template'
      : focus === 'map'
        ? isNew
          ? 'Map new KOT printer'
          : 'Edit mapping'
        : isNew
          ? 'New printer'
          : 'Edit printer'

  const templateOptions = templatesForKind(listKind)
  const previewHtml = useMemo(() => {
    if (!previewing) return ''
    if (focus !== 'template' && focus !== 'receipt' && focus !== 'kot') return ''
    return previewSlipHtml({
      brand: previewing.header || previewing.name || 'MESA',
      footer: previewing.footer,
      paperWidthMm: previewing.paperWidthMm,
      templateId: normalizeTemplateId(previewing.templateId, listKind),
      kind: listKind,
      lang,
    })
  }, [previewing, focus, listKind, lang])

  const sectionCards = useMemo(
    () =>
      (
        [
          {
            id: 'receipt' as const,
            label: 'Receipt',
            blurb: 'Front-of-house receipt printers',
            count: rows.filter((r) => r.kind === 'receipt').length,
          },
          {
            id: 'kot' as const,
            label: 'KOT',
            blurb: 'Kitchen ticket printers',
            count: rows.filter((r) => r.kind === 'kot').length,
          },
          {
            id: 'map' as const,
            label: 'Mapping',
            blurb: 'Route KOT printers by department',
            count: rows.filter((r) => r.kind === 'kot').length,
          },
          {
            id: 'template' as const,
            label: 'Template',
            blurb: 'Layout, header, footer, and paper size',
            count: rows.filter((r) => r.kind === 'receipt').length,
          },
        ] as const
      ),
    [rows],
  )

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Printers locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('printer')} className="btn btn-ghost">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-prn">
      <HubHeader closeTo={settingsHubPath('printer')} />

      <div className="zk-prn-bar">
        <div className="zk-prn-bar-copy">
          <h1>Printers</h1>
          <p>Choose a section, then manage printers for this branch.</p>
        </div>
        {showAdd ? (
          <HubAddButton
            title={focus === 'map' ? 'Add mapped printer' : 'Add printer'}
            className="zk-et-add"
            onClick={startNew}
          />
        ) : null}
      </div>

      <div className="zk-prn-sections" role="tablist" aria-label="Printer sections">
        {sectionCards.map((sec) => (
          <button
            key={sec.id}
            type="button"
            role="tab"
            aria-selected={focus === sec.id}
            className={`zk-prn-section-card${focus === sec.id ? ' on' : ''}`}
            onClick={() => setFocus(sec.id)}
          >
            <div className="zk-prn-section-card-top">
              <strong>{sec.label}</strong>
              <span className="zk-prn-badge">{sec.count}</span>
            </div>
            <small>{sec.blurb}</small>
          </button>
        ))}
      </div>

      <div className="zk-prn-body">
        <div className="zk-prn-gallery">
          <div className="zk-prn-gallery-head">
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>

          {focus === 'map' && unmappedDepts.length > 0 ? (
            <p className="zk-prn-hint">
              Unmapped: {unmappedDepts.map((d) => d.name).join(', ')}
            </p>
          ) : null}

          {focus === 'template' ? (
            <>
              <div className="zk-prn-cards zk-prn-design-cards">
                {PRINT_TEMPLATES.filter((t) => t.kinds.includes('receipt')).map((tpl) => {
                  const inUse = shown.some(
                    (r) => normalizeTemplateId(r.templateId, 'receipt') === tpl.id,
                  )
                  return (
                    <article key={tpl.id} className={`zk-prn-card zk-prn-design${inUse ? ' in-use' : ''}`}>
                      <div className="zk-prn-card-top">
                        <strong>{tpl.name}</strong>
                        {inUse ? <span className="zk-prn-badge">In use</span> : null}
                      </div>
                      <small>{tpl.blurb}</small>
                      <div className="zk-prn-card-actions">
                        <button
                          type="button"
                          className="zk-prn-card-btn"
                          onClick={() => openDesignPreview(tpl.id)}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className="zk-prn-card-btn primary"
                          onClick={() => editDesign(tpl.id)}
                        >
                          Edit
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              {shown.length > 0 ? (
                <div className="zk-prn-assigned">
                  <h3>Receipt printers using designs</h3>
                  <div className="zk-prn-cards">
                    {shown.map((r) => (
                      <article key={r.id} className={`zk-prn-card${r.active ? '' : ' off'}`}>
                        <div className="zk-prn-card-top">
                          <strong>{r.name}</strong>
                          <span className="zk-prn-badge">
                            {templateLabel(normalizeTemplateId(r.templateId, 'receipt'))}
                          </span>
                        </div>
                        <small>
                          {Number(r.paperWidthMm) || 80}mm · {r.target}
                        </small>
                        <div className="zk-prn-card-actions">
                          <button
                            type="button"
                            className="zk-prn-card-btn"
                            onClick={() => openPreview(r)}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="zk-prn-card-btn primary"
                            onClick={() => openEditor(r)}
                          >
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="zk-prn-hint">
                  No receipt printer yet — tap Edit on a design to create one, or use + above.
                </p>
              )}
            </>
          ) : shown.length === 0 ? (
            <div className="zk-prn-empty panel">
              <strong>
                {focus === 'map'
                  ? 'No KOT printers to map'
                  : `No ${listKind === 'kot' ? 'KOT' : 'receipt'} printers`}
              </strong>
              <span>
                {focus === 'map'
                  ? 'Add a KOT printer, then map a department.'
                  : 'Tap + to add a printer for this branch.'}
              </span>
              <div className="zk-prn-empty-actions">
                <button type="button" className="btn btn-primary" onClick={startNew}>
                  Add printer
                </button>
              </div>
            </div>
          ) : (
            <div className="zk-prn-cards">
              {shown.map((r) => (
                <article key={r.id} className={`zk-prn-card${r.active ? '' : ' off'}`}>
                  <div className="zk-prn-card-top">
                    <strong>{r.name}</strong>
                    <span className={`zk-prn-badge${r.active ? '' : ' muted'}`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <small>
                    {focus === 'map'
                      ? deptLabel(categories, r.departmentId)
                      : `${r.target} · ${Number(r.paperWidthMm) || 80}mm`}
                  </small>
                  <div className="zk-prn-card-actions">
                    {(focus === 'receipt' || focus === 'kot') && (
                      <button
                        type="button"
                        className="zk-prn-card-btn"
                        onClick={() => openPreview(r)}
                      >
                        Preview
                      </button>
                    )}
                    <button
                      type="button"
                      className="zk-prn-card-btn primary"
                      onClick={() => openEditor(r)}
                    >
                      Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing
        ? createPortal(
            <div
              className="modal-backdrop zk-prn-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="zk-prn-modal-title"
              onClick={closeEditor}
            >
              <div
                className="modal-card zk-prn-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="zk-prn-modal-head">
                  <div>
                    <p className="zk-prn-kicker">{formTitle}</p>
                    <h2 id="zk-prn-modal-title">{editing.name.trim() || 'Untitled'}</h2>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={closeEditor}>
                    Close
                  </button>
                </div>

                <div className="zk-prn-modal-body">
                  <div className="zk-prn-editor">
                    <div className="zk-prn-section">
                      <h3>Printer</h3>
                      {focus !== 'template' ? (
                        <label>
                          Name <Req />
                          <input
                            className="search"
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            autoFocus={focus !== 'map'}
                          />
                        </label>
                      ) : (
                        <label>
                          Name
                          <input className="search" value={editing.name} readOnly />
                        </label>
                      )}

                      {focus === 'receipt' || focus === 'kot' || focus === 'map' ? (
                        <label>
                          Target
                          {nativeBridge && targetOptions.length > 1 ? (
                            <MesaSelect
                              value={editing.target || 'browser'}
                              onChange={(v) => setEditing({ ...editing, target: v || 'browser' })}
                              options={targetOptions}
                            />
                          ) : (
                            <input
                              className="search"
                              value={editing.target}
                              onChange={(e) => setEditing({ ...editing, target: e.target.value })}
                              placeholder="browser or printer name"
                            />
                          )}
                          <small className="zk-prn-field-hint">
                            {nativeBridge
                              ? 'Choose a Windows printer for silent print, or Browser for PDF.'
                              : 'Use browser, or the Mesa desktop app for named printers.'}
                          </small>
                        </label>
                      ) : null}

                      {focus === 'map' || focus === 'kot' ? (
                        <label>
                          Department
                          <MesaSelect
                            value={editing.departmentId ?? ''}
                            onChange={(v) =>
                              setEditing({ ...editing, departmentId: v || undefined })
                            }
                            options={[
                              { value: '', label: 'All departments (default)' },
                              ...categories.map((c) => ({ value: c.id, label: c.name })),
                            ]}
                          />
                        </label>
                      ) : null}

                      {focus !== 'template' ? (
                        <label>
                          Status
                          <MesaSelect
                            value={editing.active ? 'active' : 'inactive'}
                            onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                            options={[
                              { value: 'active', label: 'Active' },
                              { value: 'inactive', label: 'Inactive' },
                            ]}
                          />
                        </label>
                      ) : null}
                    </div>

                    {focus === 'template' || focus === 'receipt' || focus === 'kot' ? (
                      <>
                        <div className="zk-prn-section">
                          <h3>Layout</h3>
                          <div className="zk-prn-tpl-grid" role="listbox" aria-label="Thermal templates">
                            {templateOptions.map((tpl) => {
                              const selected =
                                normalizeTemplateId(editing.templateId, listKind) === tpl.id
                              return (
                                <button
                                  key={tpl.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`zk-prn-tpl-card${selected ? ' on' : ''}`}
                                  onClick={() =>
                                    setEditing({
                                      ...editing,
                                      templateId: tpl.id as PrintTemplateId,
                                    })
                                  }
                                >
                                  <strong>{tpl.name}</strong>
                                  <small>{tpl.blurb}</small>
                                </button>
                              )
                            })}
                          </div>
                          {(focus === 'template' || focus === 'receipt') && (
                            <div className="zk-prn-fields-row">
                              <label>
                                Header
                                <input
                                  className="search"
                                  value={editing.header}
                                  onChange={(e) =>
                                    setEditing({ ...editing, header: e.target.value })
                                  }
                                  autoFocus={focus === 'template'}
                                />
                              </label>
                              <label>
                                Footer
                                <input
                                  className="search"
                                  value={editing.footer}
                                  onChange={(e) =>
                                    setEditing({ ...editing, footer: e.target.value })
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="zk-prn-section">
                          <h3>Paper</h3>
                          <div className="zk-prn-size-row">
                            {PAPER_WIDTH_PRESETS.map((mm) => (
                              <button
                                key={mm}
                                type="button"
                                className={`zk-prn-size-chip${
                                  Number(editing.paperWidthMm) === mm ? ' on' : ''
                                }`}
                                onClick={() => setEditing({ ...editing, paperWidthMm: mm })}
                              >
                                {mm}mm
                              </button>
                            ))}
                          </div>
                          <div className="zk-prn-fields-row">
                            <label>
                              Width (mm)
                              <input
                                className="search"
                                inputMode="numeric"
                                value={String(
                                  Number.isFinite(Number(editing.paperWidthMm))
                                    ? Number(editing.paperWidthMm) || 80
                                    : 80,
                                )}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^\d]/g, '')
                                  if (raw === '') {
                                    setEditing({ ...editing, paperWidthMm: 80 })
                                    return
                                  }
                                  setEditing({
                                    ...editing,
                                    paperWidthMm: Math.max(48, Math.min(120, Number(raw) || 80)),
                                  })
                                }}
                              />
                            </label>
                            <label>
                              Copies
                              <input
                                className="search"
                                inputMode="numeric"
                                value={String(Math.max(1, Number(editing.copies) || 1))}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing,
                                    copies: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="zk-prn-actions">
                  <button type="button" className="zk-prn-action primary" onClick={save}>
                    Save
                  </button>
                  {!isNew && focus !== 'template' ? (
                    <button type="button" className="zk-prn-action danger" onClick={remove}>
                      Delete
                    </button>
                  ) : null}
                  <button type="button" className="zk-prn-action" onClick={closeEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {previewing && previewHtml
        ? createPortal(
            <div
              className="modal-backdrop zk-prn-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="zk-prn-preview-title"
              onClick={closePreview}
            >
              <div
                className="modal-card zk-prn-preview-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="zk-prn-modal-head">
                  <div>
                    <p className="zk-prn-kicker">Preview</p>
                    <h2 id="zk-prn-preview-title">{previewing.name}</h2>
                    <small className="zk-prn-preview-meta">
                      {Number(previewing.paperWidthMm) || 80}mm ·{' '}
                      {templateLabel(normalizeTemplateId(previewing.templateId, listKind))}
                    </small>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={closePreview}>
                    Close
                  </button>
                </div>
                <div className="zk-prn-preview-stage modal">
                  <iframe
                    title="Thermal template preview"
                    className="zk-prn-preview-frame"
                    style={{
                      width: `${Math.round(((Number(previewing.paperWidthMm) || 80) * 96) / 25.4)}px`,
                    }}
                    srcDoc={previewHtml}
                  />
                </div>
                <div className="zk-prn-actions">
                  <button
                    type="button"
                    className="zk-prn-action primary"
                    onClick={() => {
                      closePreview()
                      openEditor(previewing)
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="zk-prn-action" onClick={closePreview}>
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <HubFooter backTo={settingsHubPath('printer')} backLabel="Printer" />
      {deleteConfirmDialog}
      {successMsg ? (
        <SuccessModal message={successMsg} onClose={() => setSuccessMsg('')} />
      ) : null}
    </div>
  )
}
