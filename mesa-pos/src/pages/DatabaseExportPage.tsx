import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import {
  downloadText,
  type FileTypeOpt,
  toCsv,
  transferTables,
  type TransferTableId,
} from '../lib/dataTransfer'
import { useAuth } from '../state/AuthContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { recipeLineIngredientId } from '../data/masters'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

export default function DatabaseExportPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { customers } = useCrm()
  const { categories, dishes } = useMasters()
  const { suppliers } = usePurchasing()
  const { stock, ingredients } = usePos()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [table, setTable] = useState<TransferTableId>('products')
  const [fileType, setFileType] = useState<FileTypeOpt>('csv')
  const [fileName, setFileName] = useState('Products.csv')


  function suggestName(t: TransferTableId, ft: FileTypeOpt) {
    const label = transferTables.find((x) => x.id === t)?.label ?? t
    return `${label}.${ft === 'csv' ? 'csv' : 'json'}`
  }

  function buildPayload(t: TransferTableId): { headers: string[]; rows: Array<Array<string | number>> } {
    if (t === 'department') {
      return {
        headers: ['Name', 'Alias', 'Parent', 'Active', 'Sort'],
        rows: categories.map((c) => [
          c.name,
          c.alias ?? '',
          categories.find((p) => p.id === c.parentId)?.name ?? '',
          c.active ? 1 : 0,
          c.sort,
        ]),
      }
    }
    if (t === 'products' || t === 'side-dish') {
      const sideIds = new Set(
        categories.filter((c) => /side/i.test(c.name)).map((c) => c.id),
      )
      const list =
        t === 'side-dish'
          ? dishes.filter((d) => sideIds.has(d.categoryId) || /side/i.test(d.category))
          : dishes
      return {
        headers: [
          'ProductName',
          'Alias_Name',
          'upc_code',
          'Department',
          'vendor',
          'Cost_Price',
          'Sale_Price',
          'barcode',
          'hsn_code',
          'Unit_Name',
        ],
        rows: list.map((d) => [
          d.name,
          d.alias ?? d.name,
          d.code,
          d.category,
          suppliers.find((s) => s.id === d.vendorId)?.name ?? '',
          d.cost ?? 0,
          d.price,
          '',
          d.hsn ?? '',
          'Unit',
        ]),
      }
    }
    if (t === 'customer') {
      return {
        headers: ['Name', 'mobile_no1', 'address', 'email_id'],
        rows: customers.map((c) => [c.name, c.phone, c.address ?? '', c.email ?? '']),
      }
    }
    if (t === 'vendor') {
      return {
        headers: ['Name', 'Phone', 'Email', 'City', 'Active'],
        rows: suppliers.map((s) => [s.name, s.phone, s.email ?? '', s.city, s.active ? 1 : 0]),
      }
    }
    if (t === 'ingredients') {
      return {
        headers: ['Name', 'SKU', 'Unit', 'Category', 'Active'],
        rows: ingredients.map((i) => [i.name, i.sku, i.unit, i.category, i.active ? 1 : 0]),
      }
    }
    // recipe
    return {
      headers: ['ProductCode', 'ProductName', 'Ingredient', 'Qty'],
      rows: dishes.flatMap((d) =>
        (d.recipe ?? []).map((r) => {
          const ingId = recipeLineIngredientId(r)
          const ing = ingredients.find((i) => i.id === ingId)
          const stk = stock.find((s) => s.ingredientId === ingId || s.id === ingId)
          return [d.code, d.name, ing?.name ?? stk?.name ?? ingId, r.qty]
        }),
      ),
    }
  }

  function doExport() {
    const payload = buildPayload(table)
    const name = fileName.trim() || suggestName(table, fileType)
    if (fileType === 'json') {
      const objects = payload.rows.map((r) => {
        const o: Record<string, string | number> = {}
        payload.headers.forEach((h, i) => {
          o[h] = r[i]
        })
        return o
      })
      downloadText(name.endsWith('.json') ? name : `${name}.json`, JSON.stringify(objects, null, 2), 'application/json')
    } else {
      downloadText(name.endsWith('.csv') ? name : `${name}.csv`, toCsv(payload.headers, payload.rows))
    }
    flash(`Exported ${payload.rows.length} rows · ${transferTables.find((x) => x.id === table)?.label}`)
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to={settingsHubPath('database')} className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-db zk-db-io">
      <HubHeader closeTo={settingsHubPath('database')} />

      <div className="zk-db-io-stage">
        <div className="zk-db-io-card">
          <header className="zk-db-io-head">
            <div>
              <p className="zk-db-io-kicker">Database</p>
              <h1>Export</h1>
            </div>
            <p>Download masters as CSV or JSON for backup or Excel.</p>
          </header>

          <div className="zk-db-io-fields">
            <label>
              <span>Current export table</span>
              <MesaSelect
                value={table}
                onChange={(v) => {
                  const t = v as TransferTableId
                  setTable(t)
                  setFileName(suggestName(t, fileType))
                }}
                options={transferTables.map((t) => ({ value: t.id, label: t.label }))}
              />
            </label>

            <label>
              <span>File type</span>
              <MesaSelect
                value={fileType}
                onChange={(v) => {
                  const ft = v as FileTypeOpt
                  setFileType(ft)
                  setFileName(suggestName(table, ft))
                }}
                options={[
                  { value: 'csv', label: '.CSV File' },
                  { value: 'json', label: '.JSON File' },
                ]}
              />
            </label>

            <label>
              <span>Save file name</span>
              <div className="zk-db-path">
                <input
                  className="search"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Products.csv"
                />
                <button
                  type="button"
                  className="zk-db-secondary-btn"
                  onClick={() => setFileName(suggestName(table, fileType))}
                >
                  Reset
                </button>
              </div>
            </label>
          </div>

          <div className="zk-db-io-actions">
            <button type="button" className="zk-db-primary-btn" onClick={doExport}>
              Export
            </button>
          </div>
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('database')} backLabel={t.database} />
    </div>
  )
}
