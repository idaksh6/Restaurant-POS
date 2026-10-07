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
import { getActiveBranchId } from '../data/company'
import { scopedStockId } from '../lib/stockBranch'
import {
  downloadText,
  parseSpreadsheetFile,
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
import { normalizeIngredient, type Ingredient } from '../data/ingredients'

export default function DatabaseImportPage() {
  const { user } = useAuth()
  const { flash, stock, ingredients, upsertStockItem, saveIngredient } = usePos()
  const { t } = useI18n()
  const { upsertCustomer } = useCrm()
  const { categories, dishes, saveCategory, saveDish, deleteCategory } = useMasters()
  const { suppliers, saveSupplier } = usePurchasing()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [table, setTable] = useState<TransferTableId>('stock')
  const [fileLabel, setFileLabel] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [result, setResult] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  function downloadTemplate() {
    const label = transferTables.find((t) => t.id === table)?.label ?? table
    downloadText(`${label.replace(/\s+/g, '_')}_template.csv`, templateCsv(table))
    flash(`Template · ${label} (open in Excel)`)
  }

  function cell(r: Record<string, string>, ...keys: string[]) {
    for (const k of keys) {
      if (r[k] != null && String(r[k]).trim() !== '') return String(r[k]).trim()
      const hit = Object.keys(r).find((h) => h.toLowerCase() === k.toLowerCase())
      if (hit && String(r[hit]).trim() !== '') return String(r[hit]).trim()
    }
    return ''
  }

  /** Exact name, then prefix match (Excel often truncates), else create supplier. */
  function resolveOrCreateVendor(
    vendorName: string,
    working: Supplier[],
  ): { vendor: Supplier | undefined; working: Supplier[] } {
    const name = vendorName.trim()
    if (!name) return { vendor: undefined, working }
    const key = name.toLowerCase()
    let hit =
      working.find((s) => s.name.toLowerCase() === key) ||
      working.find((s) => {
        const n = s.name.toLowerCase()
        return n.startsWith(key) || key.startsWith(n)
      })
    if (hit) return { vendor: hit, working }
    hit = {
      id: `sup-imp-${Date.now()}-${working.length}`,
      name,
      phone: '',
      city: '',
      active: true,
    }
    saveSupplier(hit)
    return { vendor: hit, working: [...working, hit] }
  }

  function importRows(rows: Record<string, string>[]) {
    let count = 0
    const branchId = getActiveBranchId()

    if (table === 'customer') {
      for (const r of rows) {
        const name = cell(r, 'Name', 'name')
        if (!name) continue
        upsertCustomer({
          name,
          phone: cell(r, 'mobile_no1', 'Phone'),
          address: cell(r, 'address', 'Address'),
          email: cell(r, 'email_id', 'Email'),
        })
        count++
      }
      setResult(`Imported ${count} customers`)
      flash(`Imported ${count} customers`)
      return
    }

    if (table === 'department') {
      const catsWorking = [...categories]
      for (const r of rows) {
        const name = cell(r, 'Name', 'name')
        if (!name) continue
        const parentName = cell(r, 'Parent')
        const parent = catsWorking.find((c) => c.name.toLowerCase() === parentName.toLowerCase())
        const existing = catsWorking.find((c) => c.name.toLowerCase() === name.toLowerCase())
        const cat: MenuCategory = {
          id: existing?.id ?? `cat-imp-${Date.now()}-${count}`,
          name,
          alias: cell(r, 'Alias') || existing?.alias,
          parentId: parent?.id ?? existing?.parentId,
          active: cell(r, 'Active') !== '0',
          sort: Number(cell(r, 'Sort')) || existing?.sort || catsWorking.length + count + 1,
        }
        saveCategory(cat)
        const idx = catsWorking.findIndex((c) => c.id === cat.id)
        if (idx >= 0) catsWorking[idx] = cat
        else catsWorking.push(cat)
        count++
      }
      setResult(`Imported ${count} departments`)
      flash(`Imported ${count} departments`)
      return
    }

    if (table === 'vendor') {
      for (const r of rows) {
        const name = cell(r, 'Name', 'name')
        if (!name) continue
        const existing = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase())
        const row: Supplier = {
          id: existing?.id ?? `sup-imp-${Date.now()}-${count}`,
          name,
          phone: cell(r, 'Phone', 'mobile_no1') || existing?.phone || '',
          phone2: cell(r, 'Phone2', 'mobile_no2') || existing?.phone2,
          email: cell(r, 'Email') || existing?.email,
          taxId: cell(r, 'TaxId', 'VAT', 'taxId') || existing?.taxId,
          city: cell(r, 'City') || existing?.city || '',
          address: cell(r, 'Address') || existing?.address,
          active: cell(r, 'Active') !== '0',
        }
        saveSupplier(row)
        count++
      }
      setResult(`Imported ${count} vendors`)
      flash(`Imported ${count} vendors`)
      return
    }

    if (table === 'products' || table === 'side-dish') {
      // Keep a local list so we reuse categories created earlier in this same import
      // (React state from saveCategory is still stale inside this loop).
      const catsWorking = [...categories]
      const dishesWorking = [...dishes]
      let created = 0
      let updated = 0
      let skipped = 0
      for (const r of rows) {
        const name = cell(r, 'ProductName', 'Name')
        if (!name) {
          skipped++
          continue
        }
        const deptNameRaw = cell(r, 'Department') || (table === 'side-dish' ? 'Sides' : '')
        const deptName =
          deptNameRaw.trim().toLowerCase() === 'all' ? '' : deptNameRaw
        let cat = deptName
          ? catsWorking.find((c) => c.name.toLowerCase() === deptName.toLowerCase())
          : undefined
        if (!cat && deptName) {
          cat = {
            id: `cat-imp-${Date.now()}-${count}`,
            name: deptName,
            sort: catsWorking.length + count + 1,
            active: true,
            parentId: catsWorking.find((c) => !c.parentId)?.id,
          }
          saveCategory(cat)
          catsWorking.push(cat)
        }
        const categoryId = cat?.id ?? catsWorking.find((c) => c.parentId)?.id ?? catsWorking[0]?.id
        if (!categoryId) {
          skipped++
          continue
        }
        const code = cell(r, 'upc_code', 'code') || `IMP${Date.now()}${count}`
        const existing = dishesWorking.find(
          (d) => d.code === code || d.name.toLowerCase() === name.toLowerCase(),
        )
        const vendorName = cell(r, 'vendor', 'Vendor')
        const vendor = suppliers.find((s) => s.name.toLowerCase() === vendorName.toLowerCase())
        const dish: MasterDish = {
          id: existing?.id ?? `d-imp-${Date.now()}-${count}`,
          name,
          alias: cell(r, 'Alias_Name') || name,
          code,
          categoryId,
          category: cat?.name ?? existing?.category ?? 'Imported',
          price: Number(cell(r, 'Sale_Price')) || existing?.price || 0,
          cost: Number(cell(r, 'Cost_Price')) || existing?.cost || 0,
          hsn: cell(r, 'hsn_code') || existing?.hsn,
          vendorId: vendor?.id ?? existing?.vendorId,
          active: cell(r, 'Active') !== '0',
          popular: existing?.popular,
          recipe: existing?.recipe,
          customizer: existing?.customizer,
          taxIds: existing?.taxIds,
        }
        saveDish(dish)
        const dIdx = dishesWorking.findIndex((d) => d.id === dish.id)
        if (dIdx >= 0) dishesWorking[dIdx] = dish
        else dishesWorking.push(dish)
        if (existing) updated++
        else created++
        count++
      }

      // Remove empty duplicate department names left by older buggy imports,
      // and drop reserved "All" categories (conflicts with the menu All filter).
      const byName = new Map<string, MenuCategory[]>()
      for (const c of catsWorking) {
        const key = c.name.trim().toLowerCase()
        if (!key) continue
        const group = byName.get(key) ?? []
        group.push(c)
        byName.set(key, group)
      }
      let pruned = 0
      for (const [key, group] of byName.entries()) {
        if (key === 'all') {
          for (const c of group) {
            const n = dishesWorking.filter((d) => d.categoryId === c.id).length
            if (n > 0) continue
            if (catsWorking.some((x) => x.parentId === c.id)) continue
            deleteCategory(c.id)
            pruned++
          }
          continue
        }
        if (group.length < 2) continue
        const scored = group
          .map((c) => ({
            c,
            n: dishesWorking.filter((d) => d.categoryId === c.id).length,
          }))
          .sort((a, b) => b.n - a.n)
        for (const { c, n } of scored.slice(1)) {
          if (n > 0) continue
          if (catsWorking.some((x) => x.parentId === c.id)) continue
          deleteCategory(c.id)
          pruned++
        }
      }

      const parts = [
        `Created ${created}`,
        `Updated ${updated}`,
        skipped ? `Skipped ${skipped}` : '',
        pruned ? `Pruned ${pruned} empty categories` : '',
      ].filter(Boolean)
      setResult(parts.join(' · '))
      flash(`Imported ${count} products`)
      return
    }

    if (table === 'stock' || table === 'ingredients') {
      let vendorsWorking = [...suppliers]
      let createdVendors = 0
      let created = 0
      let updated = 0
      for (const r of rows) {
        const name = cell(r, 'Name', 'name', 'Ingredient')
        if (!name) continue
        const sku =
          cell(r, 'SKU', 'sku', 'Code') ||
          `IMP-${name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 24)}-${count}`
        const vendorName = cell(r, 'Vendor', 'vendor')
        const beforeLen = vendorsWorking.length
        const resolved = resolveOrCreateVendor(vendorName, vendorsWorking)
        vendorsWorking = resolved.working
        if (vendorsWorking.length > beforeLen) createdVendors++
        const vendor = resolved.vendor
        const existingStock =
          stock.find((s) => s.sku.toLowerCase() === sku.toLowerCase()) ||
          stock.find((s) => s.name.toLowerCase() === name.toLowerCase())
        const existingIng =
          ingredients.find((i) => i.sku.toLowerCase() === sku.toLowerCase()) ||
          ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase())
        const isUpdate = Boolean(existingStock || existingIng)
        const qty = Number(cell(r, 'Qty', 'OnHand', 'onHand')) || existingStock?.onHand || 0
        const cost = Number(cell(r, 'Cost')) || existingStock?.cost || 0
        const unit = cell(r, 'Unit') || existingStock?.unit || existingIng?.unit || 'kg'
        const category =
          cell(r, 'Category') || existingStock?.category || existingIng?.category || 'General'
        const reorderAt =
          Number(cell(r, 'Reorder')) || existingStock?.reorderAt || existingIng?.reorderAt || 0
        const ingId =
          existingIng?.id ||
          existingStock?.ingredientId ||
          existingStock?.id ||
          scopedStockId(`st-imp-${Date.now()}-${count}`, branchId)
        const stamped = upsertStockItem({
          id: existingStock?.id ?? ingId,
          ingredientId: ingId,
          name,
          sku,
          category,
          unit,
          onHand: qty,
          reorderAt,
          cost,
          vendorId: vendor?.id ?? existingStock?.vendorId ?? existingIng?.vendorId,
          vendor: vendor?.name ?? existingStock?.vendor ?? existingIng?.vendor ?? (vendorName || undefined),
          branchId,
        })
        const vendorId = stamped.vendorId
        const vendorLabel = stamped.vendor
        const ing: Ingredient = normalizeIngredient({
          id: stamped.ingredientId || stamped.id,
          name: stamped.name,
          sku: stamped.sku,
          unit: stamped.unit,
          category: stamped.category,
          reorderAt: stamped.reorderAt,
          vendorId,
          vendor: vendorLabel,
          vendorLinks:
            vendorId
              ? [
                  {
                    vendorId,
                    vendor: vendorLabel,
                    unitPrice: cost > 0 ? cost : undefined,
                    primary: true,
                  },
                ]
              : existingIng?.vendorLinks,
          active: cell(r, 'Active') !== '0',
          defaultLocationId: existingIng?.defaultLocationId,
        })
        saveIngredient(ing)
        if (isUpdate) updated++
        else created++
        count++
      }
      setResult(
        [
          `Created ${created}`,
          `Updated ${updated}`,
          createdVendors ? `Vendors created ${createdVendors}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
      flash(`Imported ${count} rows`)
      return
    }

    if (table === 'recipe') {
      let skippedNoDish = 0
      let skippedNoIng = 0
      for (const r of rows) {
        const code = cell(r, 'ProductCode')
        const pname = cell(r, 'ProductName')
        const dish =
          dishes.find((d) => d.code === code) ||
          dishes.find((d) => d.name.toLowerCase() === pname.toLowerCase())
        const ingName = cell(r, 'Ingredient')
        const stockHit = stock.find((s) => s.name.toLowerCase() === ingName.toLowerCase())
        const ingHit = ingredients.find((i) => i.name.toLowerCase() === ingName.toLowerCase())
        const ingId = stockHit?.ingredientId || stockHit?.id || ingHit?.id
        if (!dish) {
          skippedNoDish++
          continue
        }
        if (!ingId) {
          skippedNoIng++
          continue
        }
        const qty = Number(cell(r, 'Qty')) || 0
        const recipe = [
          ...(dish.recipe ?? []).filter((x) => recipeLineIngredientId(x) !== ingId),
          { ingredientId: ingId, qty },
        ]
        saveDish({ ...dish, recipe })
        count++
      }
      setResult(
        [
          `Updated ${count} recipe lines`,
          skippedNoDish ? `Skipped ${skippedNoDish} (product code/name not found)` : '',
          skippedNoIng ? `Skipped ${skippedNoIng} (ingredient not in stock)` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
      flash(`Updated ${count} recipe lines`)
    }
  }

  function onFile(file: File | null) {
    if (!file) return
    setFileLabel(file.name)
    setPendingFile(file)
    setResult('')
  }

  async function runImport() {
    if (!pendingFile) {
      flash('Choose a CSV or Excel file first', 'err')
      return
    }
    setBusy(true)
    try {
      const matrix = await parseSpreadsheetFile(pendingFile)
      const objects = rowsToObjects(matrix)
      if (!objects.length) {
        flash('No data rows found', 'err')
        return
      }
      importRows(objects)
    } catch {
      flash('Could not read file — use CSV or Excel (.xlsx)', 'err')
    } finally {
      setBusy(false)
    }
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
            <p>
              Download the CSV template (opens in Excel), fill rows, then upload CSV or Excel
              (.xlsx / .xlsm). Stock import links Preferred vendor by name and creates missing
              vendors automatically.
            </p>
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
              Download Excel CSV template
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
              <strong>{fileLabel || 'Drop CSV / Excel here'}</strong>
              <span>{fileLabel ? 'Ready to import' : '.csv · .xlsx · .xlsm'}</span>
              <label className="zk-db-secondary-btn zk-db-browse">
                Browse
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div className="zk-db-io-actions">
            <button
              type="button"
              className="zk-db-primary-btn"
              onClick={() => void runImport()}
              disabled={busy}
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>

          {result ? <p className="zk-db-note">{result}</p> : null}
          <p className="zk-db-tip">
            Stock / ingredient <strong>Vendor</strong> names are matched to suppliers (or created
            if missing). Menu products still link via product vendor column after vendors exist.
          </p>
        </div>
      </div>

      <HubFooter backTo={settingsHubPath('database')} backLabel={t.database} />
    </div>
  )
}
