import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import AgentPanel, { AgentBanner } from '../components/printers/AgentPanel'
import AssignmentPanel from '../components/printers/AssignmentPanel'
import PrinterTable from '../components/printers/PrinterTable'
import PrinterWizard, { type WizardStep } from '../components/printers/PrinterWizard'
import { loadTableAreas } from '../data/tableAreas'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { usePrinterHealth } from '../hooks/usePrinterHealth'
import { getActiveBranchId } from '../data/company'
import {
  PAPER_WIDTH_PRESETS,
  PRINT_TEMPLATES,
  normalizeTemplateId,
  templateLabel,
  templatesForKind,
  type PrintTemplateId,
} from '../data/printTemplates'
import {
  DEFAULT_PRINTER_OPTIONS,
  hasPurpose,
  type PrintPurpose,
  type PrintStation,
} from '../data/printers'
import { previewSlipHtml, testPrintStation } from '../hardware/printer'
import { settingsHubPath } from '../lib/settingsHub'
import { messages, useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

type Focus = 'printers' | 'map' | 'template' | 'agent'
type TypeFilter = 'all' | PrintPurpose

function parseFocus(value: string | null): Focus {
  if (value === 'map' || value === 'template' || value === 'agent') return value
  return 'printers'
}

function parseFilter(value: string | null): TypeFilter {
  return value === 'kot' || value === 'bill' || value === 'receipt' ? value : 'all'
}

function blank(purposes: PrintPurpose[], sort: number): PrintStation {
  const kot = purposes.length === 1 && purposes[0] === 'kot'
  return {
    id: `prn-${kot ? 'kot' : 'receipt'}-${Date.now()}`,
    branchId: getActiveBranchId(),
    kind: kot ? 'kot' : 'receipt',
    name: kot ? 'Kitchen Printer' : purposes.includes('bill') ? 'Bill Printer' : 'Receipt Printer',
    target: '',
    copies: 1,
    paperWidthMm: 80,
    templateId: kot ? 'kitchen' : 'classic',
    header: kot ? '' : 'MESA',
    footer: kot ? '' : messages().printThanks,
    active: true,
    sort,
    purposes,
    connection: 'usb',
    port: 9100,
    options: { ...DEFAULT_PRINTER_OPTIONS },
    isDefault: false,
  }
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
  const rawFocus = searchParams.get('focus')
  const focus = parseFocus(rawFocus)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() =>
    parseFilter(searchParams.get('type') ?? (rawFocus === 'kot' || rawFocus === 'receipt' ? rawFocus : null)),
  )
  const [wizard, setWizard] = useState<{ row: PrintStation; isNew: boolean; step?: WizardStep } | null>(null)
  const [areasVersion, setAreasVersion] = useState(0)
  useEffect(() => {
    const bump = () => setAreasVersion((v) => v + 1)
    window.addEventListener('mesa:table-areas-changed', bump)
    return () => window.removeEventListener('mesa:table-areas-changed', bump)
  }, [])
  const areas = useMemo(
    () => loadTableAreas(activeBranchId).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBranchId, areasVersion],
  )
  const wizardCategories = useMemo(
    () =>
      categories
        .filter((c) => c.active !== false)
        .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId || undefined })),
    [categories],
  )
  const [editing, setEditing] = useState<PrintStation | null>(null)
  const [previewing, setPreviewing] = useState<PrintStation | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const branchRows = useMemo(
    () => [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)),
    [rows],
  )
  const health = usePrinterHealth(branchRows, canAccess)
  const shown = useMemo(
    () => (typeFilter === 'all' ? branchRows : branchRows.filter((r) => hasPurpose(r, typeFilter))),
    [branchRows, typeFilter],
  )
  const receiptRows = useMemo(() => branchRows.filter((r) => !r.purposes.every((p) => p === 'kot')), [branchRows])
  const kotRows = useMemo(() => branchRows.filter((r) => hasPurpose(r, 'kot')), [branchRows])

  const unmappedDepts = useMemo(() => {
    if (focus !== 'map') return []
    const mapped = new Set(kotRows.map((p) => p.departmentId).filter(Boolean))
    return categories.filter((c) => c.active !== false && !c.parentId && !mapped.has(c.id))
  }, [focus, kotRows, categories])

  function setFocus(next: Focus) {
    setSearchParams(next === 'printers' ? {} : { focus: next }, { replace: true })
  }

  function nextSort() {
    return Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1
  }

  function openWizard(row: PrintStation, isNew: boolean, step?: WizardStep) {
    setWizard({ row, isNew, step })
  }

  function startNew(purposes?: PrintPurpose[]) {
    const p = purposes ?? (typeFilter === 'all' ? ['kot'] : [typeFilter])
    const row = blank(p, nextSort())
    if (focus === 'map' && unmappedDepts[0]) {
      row.departmentId = unmappedDepts[0].id
      row.name = `${unmappedDepts[0].name} Printer`
    }
    openWizard(row, true)
  }

  function persist(row: PrintStation, isNew: boolean) {
    if (row.isDefault) {
      for (const other of rows) {
        if (other.id !== row.id && other.isDefault && other.purposes.some((p) => row.purposes.includes(p))) {
          savePrintStation({ ...other, isDefault: false })
        }
      }
    }
    savePrintStation({ ...row, branchId: row.branchId ?? activeBranchId })
    setWizard(null)
    setSuccessMsg(isNew ? 'Printer saved' : 'Printer updated')
    flash(isNew ? 'Printer saved' : 'Printer updated')
    void health.refresh()
  }

  function toggleActive(row: PrintStation) {
    savePrintStation({ ...row, active: !row.active })
    flash(row.active ? `${row.name} disabled` : `${row.name} enabled`)
  }

  function remove(row: PrintStation) {
    askDelete({
      name: row.name,
      onConfirm: () => {
        deletePrintStation(row.id)
        flash('Printer removed')
      },
    })
  }

  async function runTestPrint(row: PrintStation) {
    setTestingId(row.id)
    flash(`Sending test print to ${row.name}…`)
    try {
      const res = await testPrintStation(row, lang)
      if (!res.ok) flash(`✕ ${res.error}${res.hint ? ` — ${res.hint}` : ''}`)
      else if (res.mode === 'agent' || res.mode === 'silent') flash(`✓ Test print sent to ${row.name}`)
      else if (res.mode === 'pdf') flash('Test slip opened as PDF')
      else flash('Test print opened — choose the thermal printer in the dialog')
    } finally {
      setTestingId(null)
      void health.refresh()
    }
  }

  // ----- templates (existing design editor) -----
  function openEditor(row: PrintStation) {
    setEditing({
      ...row,
      paperWidthMm: Number(row.paperWidthMm) || 80,
      copies: Math.max(1, Number(row.copies) || 1),
      templateId: normalizeTemplateId(row.templateId, 'receipt'),
    })
  }

  function openPreview(row: PrintStation) {
    const kind = row.purposes.every((p) => p === 'kot') ? 'kot' : 'receipt'
    setPreviewing({ ...row, paperWidthMm: Number(row.paperWidthMm) || 80, templateId: normalizeTemplateId(row.templateId, kind) })
  }

  function openDesignPreview(templateId: PrintTemplateId) {
    const base = receiptRows.find((r) => r.active) || receiptRows[0] || blank(['receipt'], nextSort())
    openPreview({
      ...base,
      templateId,
      header: base.header || 'MESA',
      footer: base.footer || messages().printThanks,
    })
  }

  function editDesign(templateId: PrintTemplateId) {
    const base = receiptRows.find((r) => r.active) || receiptRows[0]
    if (!base) {
      const row = blank(['receipt'], nextSort())
      row.templateId = templateId
      openWizard(row, true)
      flash('Create a receipt printer to use this design')
      return
    }
    openEditor({ ...base, templateId })
  }

  function saveTemplate() {
    if (!editing) return
    savePrintStation({
      ...editing,
      copies: Math.max(1, Number(editing.copies) || 1),
      paperWidthMm: Number(editing.paperWidthMm) || 80,
      templateId: normalizeTemplateId(editing.templateId, 'receipt'),
    })
    setEditing(null)
    setSuccessMsg('Printer updated')
    flash('Printer updated')
  }

  const previewKind = previewing && previewing.purposes.every((p) => p === 'kot') ? 'kot' : 'receipt'
  const previewHtml = useMemo(() => {
    if (!previewing) return ''
    return previewSlipHtml({
      brand: previewing.header || previewing.name || 'MESA',
      footer: previewing.footer,
      paperWidthMm: previewing.paperWidthMm,
      templateId: normalizeTemplateId(previewing.templateId, previewKind),
      kind: previewKind,
      lang,
    })
  }, [previewing, previewKind, lang])

  const agentOnline = Boolean(health.agent)
  const sectionCards: { id: Focus; label: string; blurb: string; badge: string }[] = [
    { id: 'printers', label: 'Printers', blurb: 'KOT, bill and receipt printers', badge: String(branchRows.length) },
    { id: 'map', label: 'Assignment', blurb: 'Order type, area & category routing', badge: String(branchRows.filter((r) => r.active).length) },
    { id: 'template', label: 'Templates', blurb: 'Layout, header, footer, paper', badge: String(receiptRows.length) },
    {
      id: 'agent',
      label: 'Print Agent',
      blurb: 'Local agent on this computer',
      badge: health.agentChecking ? '…' : agentOnline ? 'On' : 'Off',
    },
  ]

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
          <p>Manage thermal printers for KOT, Bill and Receipt printing.</p>
        </div>
        {focus === 'printers' || focus === 'map' ? (
          <HubAddButton title="Add printer" className="zk-et-add" onClick={() => startNew(focus === 'map' ? ['kot'] : undefined)} />
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
              <span className={`zk-prn-badge${sec.id === 'agent' && !agentOnline ? ' muted' : ''}`}>{sec.badge}</span>
            </div>
            <small>{sec.blurb}</small>
          </button>
        ))}
      </div>

      <div className="zk-prn-body">
        <div className="zk-prn-gallery">
          {focus === 'printers' ? (
            <>
              {branchRows.some((r) => r.connection !== 'browser') ? (
                <AgentBanner error={health.agentError} checking={health.checking} onRetry={() => void health.refresh()} />
              ) : null}
              <div className="zk-pm-toolbar">
                <div className="zk-pm-filters" role="tablist" aria-label="Printer type">
                  {(['all', 'kot', 'bill', 'receipt'] as TypeFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={typeFilter === f}
                      className={`zk-pm-filter${typeFilter === f ? ' on' : ''}`}
                      onClick={() => setTypeFilter(f)}
                    >
                      {f === 'all' ? 'All' : f === 'kot' ? 'KOT' : f === 'bill' ? 'Bill' : 'Receipt'}
                    </button>
                  ))}
                </div>
                {agentOnline ? (
                  <button type="button" className="zk-pm-btn" onClick={() => void health.refresh()} disabled={health.checking}>
                    {health.checking ? 'Checking…' : 'Check status'}
                  </button>
                ) : null}
              </div>

              {shown.length === 0 ? (
                <div className="zk-prn-empty panel">
                  <strong>{typeFilter === 'all' ? 'No printers yet' : `No ${typeFilter === 'kot' ? 'KOT' : typeFilter} printers`}</strong>
                  <span>Add your kitchen, bill and receipt printers for this branch.</span>
                  <div className="zk-prn-empty-actions">
                    <button type="button" className="btn btn-primary" onClick={() => startNew()}>
                      Add printer
                    </button>
                  </div>
                </div>
              ) : (
                <PrinterTable
                  printers={shown}
                  health={health.health}
                  agentError={health.agentError}
                  agentChecking={health.agentChecking}
                  testingId={testingId}
                  onEdit={(p) => openWizard(p, false)}
                  onTest={(p) => void runTestPrint(p)}
                  onToggle={toggleActive}
                  onDelete={remove}
                />
              )}
            </>
          ) : null}

          {focus === 'map' ? (
            <AssignmentPanel
              printers={branchRows}
              categories={wizardCategories}
              areas={areas}
              onEdit={(p) => openWizard(p, false, 'routing')}
              onAdd={() => startNew(['kot'])}
            />
          ) : null}

          {focus === 'template' ? (
            <>
              <div className="zk-prn-gallery-head">
                <div>
                  <h2>Print designs</h2>
                  <p>Preview a design, then Edit to apply it on a receipt printer (header, footer, paper size).</p>
                </div>
              </div>
              <div className="zk-prn-cards zk-prn-design-cards">
                {PRINT_TEMPLATES.filter((t) => t.kinds.includes('receipt')).map((tpl) => {
                  const inUse = receiptRows.some((r) => normalizeTemplateId(r.templateId, 'receipt') === tpl.id)
                  return (
                    <article key={tpl.id} className={`zk-prn-card zk-prn-design${inUse ? ' in-use' : ''}`}>
                      <div className="zk-prn-card-top">
                        <strong>{tpl.name}</strong>
                        {inUse ? <span className="zk-prn-badge">In use</span> : null}
                      </div>
                      <small>{tpl.blurb}</small>
                      <div className="zk-prn-card-actions">
                        <button type="button" className="zk-prn-card-btn" onClick={() => openDesignPreview(tpl.id)}>
                          Preview
                        </button>
                        <button type="button" className="zk-prn-card-btn primary" onClick={() => editDesign(tpl.id)}>
                          Edit
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              {receiptRows.length > 0 ? (
                <div className="zk-prn-assigned">
                  <h3>Receipt printers using designs</h3>
                  <div className="zk-prn-cards">
                    {receiptRows.map((r) => (
                      <article key={r.id} className={`zk-prn-card${r.active ? '' : ' off'}`}>
                        <div className="zk-prn-card-top">
                          <strong>{r.name}</strong>
                          <span className="zk-prn-badge">{templateLabel(normalizeTemplateId(r.templateId, 'receipt'))}</span>
                        </div>
                        <small>{Number(r.paperWidthMm) || 80}mm</small>
                        <div className="zk-prn-card-actions">
                          <button type="button" className="zk-prn-card-btn" onClick={() => openPreview(r)}>
                            Preview
                          </button>
                          <button type="button" className="zk-prn-card-btn primary" onClick={() => openEditor(r)}>
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="zk-prn-hint">No receipt printer yet — tap Edit on a design to create one.</p>
              )}
            </>
          ) : null}

          {focus === 'agent' ? (
            <AgentPanel
              agent={health.agent}
              agentError={health.agentError}
              checking={health.checking}
              onRetry={() => void health.refresh()}
            />
          ) : null}
        </div>
      </div>

      {wizard ? (
        <PrinterWizard
          key={wizard.row.id}
          initial={wizard.row}
          isNew={wizard.isNew}
          initialStep={wizard.step}
          categories={wizardCategories}
          areas={areas}
          lang={lang}
          onSave={(row) => persist(row, wizard.isNew)}
          onCancel={() => setWizard(null)}
        />
      ) : null}

      {editing
        ? createPortal(
            <div
              className="modal-backdrop zk-prn-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="zk-prn-modal-title"
              onClick={() => setEditing(null)}
            >
              <div className="modal-card zk-prn-modal" onClick={(e) => e.stopPropagation()}>
                <div className="zk-prn-modal-head">
                  <div>
                    <p className="zk-prn-kicker">Edit print template</p>
                    <h2 id="zk-prn-modal-title">{editing.name.trim() || 'Untitled'}</h2>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                    Close
                  </button>
                </div>

                <div className="zk-prn-modal-body">
                  <div className="zk-prn-editor">
                    <div className="zk-prn-section">
                      <h3>Layout</h3>
                      <div className="zk-prn-tpl-grid" role="listbox" aria-label="Thermal templates">
                        {templatesForKind('receipt').map((tpl) => {
                          const selected = normalizeTemplateId(editing.templateId, 'receipt') === tpl.id
                          return (
                            <button
                              key={tpl.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`zk-prn-tpl-card${selected ? ' on' : ''}`}
                              onClick={() => setEditing({ ...editing, templateId: tpl.id as PrintTemplateId })}
                            >
                              <strong>{tpl.name}</strong>
                              <small>{tpl.blurb}</small>
                            </button>
                          )
                        })}
                      </div>
                      <div className="zk-prn-fields-row">
                        <label>
                          Header
                          <input
                            className="search"
                            value={editing.header}
                            onChange={(e) => setEditing({ ...editing, header: e.target.value })}
                            autoFocus
                          />
                        </label>
                        <label>
                          Footer
                          <input
                            className="search"
                            value={editing.footer}
                            onChange={(e) => setEditing({ ...editing, footer: e.target.value })}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="zk-prn-section">
                      <h3>Paper</h3>
                      <div className="zk-prn-size-row">
                        {PAPER_WIDTH_PRESETS.map((mm) => (
                          <button
                            key={mm}
                            type="button"
                            className={`zk-prn-size-chip${Number(editing.paperWidthMm) === mm ? ' on' : ''}`}
                            onClick={() => setEditing({ ...editing, paperWidthMm: mm })}
                          >
                            {mm}mm
                          </button>
                        ))}
                      </div>
                      <div className="zk-prn-fields-row">
                        <label>
                          Copies
                          <input
                            className="search"
                            inputMode="numeric"
                            value={String(Math.max(1, Number(editing.copies) || 1))}
                            onChange={(e) => setEditing({ ...editing, copies: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="zk-prn-actions">
                  <button type="button" className="zk-prn-action primary" onClick={saveTemplate}>
                    Save
                  </button>
                  <button type="button" className="zk-prn-action" onClick={() => setEditing(null)}>
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
              onClick={() => setPreviewing(null)}
            >
              <div className="modal-card zk-prn-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="zk-prn-modal-head">
                  <div>
                    <p className="zk-prn-kicker">Preview</p>
                    <h2 id="zk-prn-preview-title">{previewing.name}</h2>
                    <small className="zk-prn-preview-meta">
                      {Number(previewing.paperWidthMm) || 80}mm ·{' '}
                      {templateLabel(normalizeTemplateId(previewing.templateId, previewKind))}
                    </small>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => setPreviewing(null)}>
                    Close
                  </button>
                </div>
                <div className="zk-prn-preview-stage modal">
                  <iframe
                    title="Thermal template preview"
                    className="zk-prn-preview-frame"
                    style={{ width: `${Math.round(((Number(previewing.paperWidthMm) || 80) * 96) / 25.4)}px` }}
                    srcDoc={previewHtml}
                  />
                </div>
                <div className="zk-prn-actions">
                  <button
                    type="button"
                    className="zk-prn-action primary"
                    onClick={() => {
                      const row = previewing
                      setPreviewing(null)
                      if (rows.some((r) => r.id === row.id)) openEditor(row)
                      else editDesign(row.templateId)
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="zk-prn-action" onClick={() => setPreviewing(null)}>
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
      {successMsg ? <SuccessModal message={successMsg} onClose={() => setSuccessMsg('')} /> : null}
    </div>
  )
}
