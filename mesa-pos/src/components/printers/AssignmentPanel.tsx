import { useMemo, useState } from 'react'
import MesaSelect from '../MesaSelect'
import type { OrderType } from '../../data/mock'
import {
  explainRoute,
  hasPurpose,
  ROUTE_ORDER_TYPES,
  type PrintPurpose,
  type PrintStation,
} from '../../data/printers'
import type { WizardCategory } from './PrinterWizard'

const PURPOSE_LABEL: Record<PrintPurpose, string> = { kot: 'KOT', bill: 'Bill', receipt: 'Receipt' }

function categoryChain(id: string, all: WizardCategory[]) {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    cur = all.find((c) => c.id === cur)?.parentId
  }
  return out
}

function names(ids: string[], all: { id: string; name: string }[]) {
  return ids.map((id) => all.find((x) => x.id === id)?.name ?? 'Removed').join(', ')
}

export default function AssignmentPanel({
  printers,
  categories,
  areas,
  onEdit,
  onAdd,
}: {
  printers: PrintStation[]
  categories: WizardCategory[]
  areas: { id: string; name: string }[]
  onEdit: (p: PrintStation) => void
  onAdd: () => void
}) {
  const [doc, setDoc] = useState<PrintPurpose>('kot')
  const [orderType, setOrderType] = useState<OrderType>('dine-in')
  const [areaId, setAreaId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const result = useMemo(
    () =>
      explainRoute(printers, doc, {
        orderType,
        areaId: orderType === 'dine-in' ? areaId || undefined : undefined,
        categoryIds: doc === 'kot' && categoryId ? categoryChain(categoryId, categories) : [],
      }),
    [printers, doc, orderType, areaId, categoryId, categories],
  )

  const reasonText =
    result.reason === 'rule'
      ? 'Matches this printer’s assignment.'
      : result.reason === 'receipt-printer'
        ? 'No bill printer matches — the receipt printer prints the bill.'
        : result.reason === 'fallback'
          ? 'No printer is assigned to this — the default printer of this type prints it.'
          : `No active ${PURPOSE_LABEL[doc]} printer in this branch.`

  const active = printers.filter((p) => p.active)

  return (
    <div className="zk-pm-assign">
      <div className="zk-prn-gallery-head">
        <div>
          <h2>Printer assignment</h2>
          <p>Choose which printer prints each KOT, bill and receipt — by order type, dine-in area, kitchen department and menu category.</p>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="zk-prn-empty panel">
          <strong>No active printers</strong>
          <span>Add a printer first, then set where it prints.</span>
          <div className="zk-prn-empty-actions">
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              Add printer
            </button>
          </div>
        </div>
      ) : (
        <div className="zk-pm-table zk-pm-assign-table" role="table" aria-label="Printer assignment">
          <div className="zk-pm-tr zk-pm-thead" role="row">
            <span role="columnheader">Printer</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Order types</span>
            <span role="columnheader">Areas</span>
            <span role="columnheader">Kitchen / categories</span>
            <span role="columnheader" className="zk-pm-col-actions">Actions</span>
          </div>
          {active.map((p) => {
            const r = p.options.routing
            const kot = hasPurpose(p, 'kot')
            const kitchen = [
              p.departmentId ? names([p.departmentId], categories) : '',
              r.categoryIds.length ? names(r.categoryIds, categories) : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={p.id} className="zk-pm-tr" role="row">
                <span className="zk-pm-name" role="cell">
                  <strong>{p.name}</strong>
                  {p.isDefault ? <small className="zk-pm-default">Default</small> : null}
                </span>
                <span className="zk-pm-types" role="cell">
                  {p.purposes.map((x) => (
                    <span key={x} className={`zk-pm-chip is-${x}`}>{PURPOSE_LABEL[x]}</span>
                  ))}
                </span>
                <span className="zk-pm-cell" role="cell" data-label="Order types">
                  {r.orderTypes.length ? r.orderTypes.map((o) => ROUTE_ORDER_TYPES.find((x) => x.id === o)?.label.split(' /')[0]).join(', ') : <span className="zk-pm-muted">All</span>}
                </span>
                <span className="zk-pm-cell" role="cell" data-label="Areas">
                  {r.areaIds.length ? names(r.areaIds, areas) : <span className="zk-pm-muted">All</span>}
                </span>
                <span className="zk-pm-cell" role="cell" data-label="Kitchen / categories">
                  {kot ? kitchen || <span className="zk-pm-muted">All</span> : <span className="zk-pm-muted">—</span>}
                </span>
                <span className="zk-pm-col-actions" role="cell">
                  <button type="button" className="zk-pm-btn" onClick={() => onEdit(p)}>
                    Edit
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <section className="zk-pm-card zk-pm-tester">
        <h3>Which printer will print?</h3>
        <div className="zk-pm-tester-grid">
          <label className="zk-pm-field">
            <span>Document</span>
            <MesaSelect
              value={doc}
              onChange={(v) => setDoc(v as PrintPurpose)}
              options={[
                { value: 'kot', label: 'KOT' },
                { value: 'bill', label: 'Bill' },
                { value: 'receipt', label: 'Receipt' },
              ]}
            />
          </label>
          <label className="zk-pm-field">
            <span>Order type</span>
            <MesaSelect
              value={orderType}
              onChange={(v) => setOrderType(v as OrderType)}
              options={ROUTE_ORDER_TYPES.map((o) => ({ value: o.id, label: o.label }))}
            />
          </label>
          {orderType === 'dine-in' && areas.length ? (
            <label className="zk-pm-field">
              <span>Area</span>
              <MesaSelect
                value={areaId}
                onChange={setAreaId}
                options={[{ value: '', label: 'Any area' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
              />
            </label>
          ) : null}
          {doc === 'kot' && categories.length ? (
            <label className="zk-pm-field">
              <span>Item category</span>
              <MesaSelect
                value={categoryId}
                onChange={setCategoryId}
                options={[{ value: '', label: 'Any category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </label>
          ) : null}
        </div>
        <div className={`zk-pm-callout ${result.printer ? (result.reason === 'rule' ? 'is-ok' : '') : 'is-bad'}`} role="status">
          <strong>{result.printer ? result.printer.name : 'Nothing will print'}</strong>
          <span>{reasonText}</span>
        </div>
      </section>
    </div>
  )
}
