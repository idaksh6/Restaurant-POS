import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import type { MasterDish, MenuCategory } from '../data/masters'
import { recipeLineIngredientId } from '../data/masters'
import type { Supplier } from '../data/purchasing'
import {
  downloadText,
  parseCsv,
  rowsToObjects,
  templateCsv,
  transferTables,
  type TransferTableId,
} from '../lib/dataTransfer'
import { useAuth } from '../state/AuthContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'
import { tenantGetItem, tenantSetItem } from '../data/repos/db'

export default function DatabaseImportPage() {
  const { user } = useAuth()
  const { flash, stock, adjustStock } = usePos()
  const { t } = useI18n()
  const { upsertCustomer } = useCrm()
  const { categories, dishes, saveCategory, saveDish } = useMasters()
  const { suppliers, saveSupplier } = usePurchasing()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [table, setTable] = useState<TransferTableId>('customer')
  const [fileLabel, setFileLabel] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [result, setResult] = useState('')
  const [dragOver, setDragOver] = useState(false)


  function downloadTemplate() {
    const label = transferTables.find((t) => t.id === table)?.label ?? table
    downloadText(`${label}.csv`, templateCsv(table))
    flash(`Template · ${label}.csv`)
  }

  function importRows(rows: Record<string, string>[]) {
    let count = 0
    if (table === 'customer') {
      for (const r of rows) {
        const name = r.Name || r.name
        if (!name) continue
        upsertCustomer({
          name,
          phone: r.mobile_no1 || r.Phone || '',
          address: r.address || r.Address || '',
          email: r.email_id || r.Email || '',
        })
        count++
      }
      setResult(`Imported ${count} customers`)
      flash(`Imported ${count} customers`)
      return
    }

    if (table === 'department') {
      for (const r of rows) {
        const name = r.Name || r.name
        if (!name) continue
        const parentName = r.Parent || ''
        const parent = categories.find((c) => c.name.toLowerCase() === parentName.toLowerCase())
        const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
        const cat: MenuCategory = {
          id: existing?.id ?? `cat-imp-${Date.now()}-${count}`,
          name,
          alias: r.Alias || existing?.alias,
          parentId: parent?.id ?? existing?.parentId,
          active: r.Active !== '0',
          sort: Number(r.Sort) || existing?.sort || categories.length + count + 1,
        }
        saveCategory(cat)
        count++
      }
      setResult(`Imported ${count} departments`)
      flash(`Imported ${count} departments`)
      return
    }

    if (table === 'vendor') {
      for (const r of rows) {
        const name = r.Name || r.name
        if (!name) continue
        const existing = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase())
        const row: Supplier = {
          id: existing?.id ?? `sup-imp-${Date.now()}-${count}`,
          name,
          phone: r.Phone || existing?.phone || '',
          email: r.Email || existing?.email,
          city: r.City || existing?.city || 'Riyadh',
          active: r.Active !== '0',
          address: existing?.address,
        }
        saveSupplier(row)
        count++
      }
      setResult(`Imported ${count} vendors`)
      flash(`Imported ${count} vendors`)
      return
    }

    if (table === 'products' || table === 'side-dish') {
      for (const r of rows) {
        const name = r.ProductName || r.Name
        if (!name) continue
        const deptName = r.Department || (table === 'side-dish' ? 'Sides' : '')
        let cat = categories.find((c) => c.name.toLowerCase() === deptName.toLowerCase())
        if (!cat && deptName) {
          cat = {
            id: `cat-imp-${Date.now()}-${count}`,
            name: deptName,
            sort: categories.length + count + 1,
            active: true,
            parentId: categories.find((c) => !c.parentId)?.id,
          }
          saveCategory(cat)
        }
        const categoryId = cat?.id ?? categories.find((c) => c.parentId)?.id ?? categories[0]?.id
        if (!categoryId) continue
        const code = r.upc_code || r.code || `IMP${Date.now()}${count}`
        const existing = dishes.find(
          (d) => d.code === code || d.name.toLowerCase() === name.toLowerCase(),
        )
        const vendorName = r.vendor || ''
        const vendor = suppliers.find((s) => s.name.toLowerCase() === vendorName.toLowerCase())
        const dish: MasterDish = {
          id: existing?.id ?? `d-imp-${Date.now()}-${count}`,
          name,
          alias: r.Alias_Name || name,
          code,
          categoryId,
          category: cat?.name ?? existing?.category ?? 'Imported',
          price: Number(r.Sale_Price) || existing?.price || 0,
          cost: Number(r.Cost_Price) || existing?.cost || 0,
          hsn: r.hsn_code || existing?.hsn,
          vendorId: vendor?.id ?? existing?.vendorId,
          active: r.Active !== '0',
          popular: existing?.popular,
          recipe: existing?.recipe,
          customizer: existing?.customizer,
          taxIds: existing?.taxIds,
        }
        saveDish(dish)
        count++
      }
      setResult(`Imported ${count} products`)
      flash(`Imported ${count} products`)
      return
    }

    if (table === 'ingredients') {
      for (const r of rows) {
        const name = r.Name || r.name
        if (!name) continue
        const existing = stock.find((s) => s.name.toLowerCase() === name.toLowerCase())
        const qty = Number(r.Qty) || 0
        if (existing) {
          const delta = qty - existing.onHand
          if (delta !== 0) adjustStock(existing.id, delta, 'CSV import')
        } else {
          // receiveStock only updates existing — create via adjust won't work for new
          // Persist new stock item directly
          const raw = tenantGetItem('mesa-stock')
          const list = raw ? (JSON.parse(raw) as typeof stock) : [...stock]
          list.push({
            id: `st-imp-${Date.now()}-${count}`,
            name,
            sku: `IMP-${count}`,
            category: 'Imported',
            unit: r.Unit || 'kg',
            onHand: qty,
            reorderAt: Number(r.Reorder) || 0,
            cost: Number(r.Cost) || 0,
          })
          tenantSetItem('mesa-stock', JSON.stringify(list))
        }
        count++
      }
      setResult(`Imported ${count} ingredients — reload if stock list looks stale`)
      flash(`Imported ${count} ingredients`)
      return
    }

    if (table === 'recipe') {
      for (const r of rows) {
        const code = r.ProductCode || ''
        const pname = r.ProductName || ''
        const dish =
          dishes.find((d) => d.code === code) ||
          dishes.find((d) => d.name.toLowerCase() === pname.toLowerCase())
        const ingName = r.Ingredient || ''
        const ing = stock.find((s) => s.name.toLowerCase() === ingName.toLowerCase())
        if (!dish || !ing) continue
        const qty = Number(r.Qty) || 0
        const recipe = [
          ...(dish.recipe ?? []).filter((x) => recipeLineIngredientId(x) !== ing.id),
          { ingredientId: ing.id, qty },
        ]
        saveDish({ ...dish, recipe })
        count++
      }
      setResult(`Updated ${count} recipe lines`)
      flash(`Updated ${count} recipe lines`)
    }
  }

  function onFile(file: File | null) {
    if (!file) return
    setFileLabel(file.name)
    setPendingFile(file)
    setResult('')
  }

  function runImport() {
    if (!pendingFile) {
      flash('Choose a CSV file first')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const matrix = parseCsv(text)
        const objects = rowsToObjects(matrix)
        if (!objects.length) {
          flash('No data rows found')
          return
        }
        importRows(objects)
      } catch {
        flash('Could not read CSV')
      }
    }
    reader.readAsText(pendingFile)
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
              <h1>Import</h1>
            </div>
            <p>Upload a CSV template to add or update masters in this browser.</p>
          </header>

          <div className="zk-db-io-fields">
            <label>
              <span>Current import table</span>
              <MesaSelect
                value={table}
                onChange={(v) => setTable(v as TransferTableId)}
                options={transferTables.map((t) => ({ value: t.id, label: t.label }))}
              />
            </label>

            <button type="button" className="zk-db-template-btn" onClick={downloadTemplate}>
              Download import template
            </button>

            <div
              className={`zk-db-drop${dragOver ? ' over' : ''}${fileLabel ? ' ready' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                onFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <strong>{fileLabel || 'Drop CSV here'}</strong>
              <span>{fileLabel ? 'Ready to import' : 'or browse from your computer'}</span>
              <label className="zk-db-secondary-btn zk-db-browse">
                Browse
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div className="zk-db-io-actions">
            <button type="button" className="zk-db-primary-btn" onClick={runImport}>
              Import
            </button>
          </div>

          {result ? <p className="zk-db-note">{result}</p> : null}
          <p className="zk-db-tip">
            After importing customers, open Delivery → Customer search to verify names.
          </p>
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('database')} backLabel={t.database} />
    </div>
  )
}
