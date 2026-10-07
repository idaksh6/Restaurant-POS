import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import AccessDenied from '../components/AccessDenied'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import { getPermissions } from '../auth/roles'
import { money } from '../data/mock'
import { loadTransfers, transferItemName, type StockTransfer } from '../data/stockTransfers'
import type { PurchaseOrder } from '../data/purchasing'
import { useI18n } from '../locale/i18n'
import { downloadReportsWorkbook } from '../lib/reportExport'
import { printReportFromElement } from '../lib/reportPrint'
import {
  loadReportFavorites,
  loadReportVisits,
  markReportVisited,
  REPORT_CATEGORY_LABEL,
  REPORT_CATEGORY_ORDER,
  REPORT_DEFS,
  saveReportFavorites,
  type ReportCategoryId,
  type ReportId,
} from '../lib/reportCatalog'
import { stockForBranch } from '../lib/stockBranch'
import {
  buildOverview,
  channelBreakdown,
  discountsInRange,
  estimateCogs,
  expensesByType,
  expensesInRange,
  foodCostVariance,
  paymentBreakdown,
  resolveReportRange,
  salesByDay,
  salesByHour,
  salesInRange,
  staffBreakdown,
  topItems,
  voidAuditRows,
  voidsInRange,
  type NamedAmount,
  type ReportPeriod,
  type ReportRange,
} from '../lib/reportStats'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

const PAGE_SIZE = 10

function formatDayLabel(iso: string, lang: 'en' | 'ar') {
  const day = iso.slice(0, 10)
  const d = new Date(`${day}T12:00:00`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function dayOf(iso: string) {
  return iso.slice(0, 10)
}

function inRange(day: string, range: ReportRange) {
  return day >= range.from && day <= range.to
}

function poLineTotal(po: PurchaseOrder) {
  return po.lines.reduce((sum, line) => sum + line.qtyOrdered * line.unitCost, 0)
}

function poQtyOrdered(po: PurchaseOrder) {
  return po.lines.reduce((sum, line) => sum + line.qtyOrdered, 0)
}

function poQtyReceived(po: PurchaseOrder) {
  return po.lines.reduce((sum, line) => sum + line.qtyReceived, 0)
}

function pagerPageList(pageCount: number, safePage: number) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set<number>([1, pageCount, safePage, safePage - 1, safePage + 1])
  return [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
}

function ReportPager({
  total,
  page,
  pageSize,
  onPage,
  ofLabel,
  prevLabel,
  nextLabel,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
  ofLabel: string
  prevLabel: string
  nextLabel: string
}) {
  if (total <= 0) return null
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (pageCount <= 1) return null
  const safePage = Math.min(Math.max(1, page), pageCount)
  const pages = pagerPageList(pageCount, safePage)
  const from = (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)
  return (
    <div className="rpt-pager no-print">
      <span className="mesa-ltr-nums">
        {from}–{to} {ofLabel} {total}
      </span>
      <div className="rpt-pager-actions">
        <button
          type="button"
          className="rpt-page-btn"
          disabled={safePage <= 1}
          onClick={() => onPage(Math.max(1, safePage - 1))}
        >
          {prevLabel}
        </button>
        {pages.map((n, i) => {
          const prev = pages[i - 1]
          const showGap = prev != null && n - prev > 1
          return (
            <span key={n} className="rpt-page-group">
              {showGap ? <span className="rpt-page-gap">…</span> : null}
              <button
                type="button"
                className={`rpt-page-btn${n === safePage ? ' on' : ''}`}
                onClick={() => onPage(n)}
                aria-current={n === safePage ? 'page' : undefined}
              >
                {n}
              </button>
            </span>
          )
        })}
        <button
          type="button"
          className="rpt-page-btn"
          disabled={safePage >= pageCount}
          onClick={() => onPage(Math.min(pageCount, safePage + 1))}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

function AmountTable({
  rows,
  fmt,
  nameLabel,
  amountLabel,
  countLabel,
  qtyLabel,
  showCount,
  showQty,
  empty,
  emptyHint,
  pageSize = PAGE_SIZE,
}: {
  rows: NamedAmount[]
  fmt: (n: number) => string
  nameLabel: string
  amountLabel: string
  countLabel?: string
  qtyLabel?: string
  showCount?: boolean
  showQty?: boolean
  empty: string
  emptyHint: string
  pageSize?: number
}) {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [rows])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  if (!rows.length) {
    return (
      <div className="rpt-empty">
        <strong>{empty}</strong>
        <span>{emptyHint}</span>
      </div>
    )
  }
  return (
    <div className="rpt-table-block">
      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <thead>
            <tr>
              <th>{nameLabel}</th>
              {showQty ? <th>{qtyLabel}</th> : null}
              {showCount ? <th>{countLabel}</th> : null}
              <th>{amountLabel}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                {showQty ? <td className="mesa-ltr-nums">{row.qty ?? 0}</td> : null}
                {showCount ? <td className="mesa-ltr-nums">{row.count ?? 0}</td> : null}
                <td className="mesa-ltr-nums">{fmt(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReportPager
        total={rows.length}
        page={safePage}
        pageSize={pageSize}
        onPage={setPage}
        ofLabel={t.expensePagerOf}
        prevLabel={t.expensePagerPrev}
        nextLabel={t.expensePagerNext}
      />
    </div>
  )
}

function PaginatedTable({
  total,
  page,
  onPage,
  ofLabel,
  prevLabel,
  nextLabel,
  children,
}: {
  total: number
  page: number
  onPage: (page: number) => void
  ofLabel: string
  prevLabel: string
  nextLabel: string
  children: ReactNode
}) {
  if (total <= 0) return null
  return (
    <div className="rpt-table-block">
      <div className="rpt-table-wrap">{children}</div>
      <ReportPager
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={onPage}
        ofLabel={ofLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
      />
    </div>
  )
}

const REPORT_PERIODS: ReportPeriod[] = ['today', '7d', '30d', 'month', 'custom']

function parseReportId(raw: string | null): ReportId | null {
  if (!raw) return null
  return REPORT_DEFS.some((d) => d.id === raw) ? (raw as ReportId) : null
}

function parseReportPeriod(raw: string | null): ReportPeriod {
  if (raw && REPORT_PERIODS.includes(raw as ReportPeriod)) return raw as ReportPeriod
  return '30d'
}

export default function ReportsPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { activeBranch } = useBranch()
  const { ledger, flash, stock } = usePos()
  const [searchParams, setSearchParams] = useSearchParams()
  const printRootRef = useRef<HTMLDivElement>(null)
  const { expenseDetails, expenseTypes } = useCatalog()
  const { dishes } = useMasters()
  const { purchaseOrders, suppliers } = usePurchasing()
  const canAccess = user
    ? getPermissions(user.role).canBackOffice ||
      getPermissions(user.role).canMasters ||
      user.role === 'admin'
    : false

  const activeReport = parseReportId(searchParams.get('report'))
  const period = parseReportPeriod(searchParams.get('period'))
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''

  const [hubCategory, setHubCategory] = useState<ReportCategoryId>('all')
  const [favorites, setFavorites] = useState(() => loadReportFavorites())
  const [visits, setVisits] = useState(() => loadReportVisits())
  const tab = activeReport ?? 'overview'
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const [stockPage, setStockPage] = useState(1)
  const [transferPage, setTransferPage] = useState(1)
  const [poPage, setPoPage] = useState(1)

  function patchSearch(patch: Record<string, string | null>, replace = true) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value == null || value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace },
    )
  }

  function setPeriod(next: ReportPeriod) {
    if (next === 'custom') {
      patchSearch({ period: 'custom' })
      return
    }
    patchSearch({ period: next, from: null, to: null })
  }

  function setDateFrom(value: string) {
    patchSearch({ period: 'custom', from: value || null })
  }

  function setDateTo(value: string) {
    patchSearch({ period: 'custom', to: value || null })
  }

  useEffect(() => {
    if (!activeReport) return
    setVisits(markReportVisited(activeReport))
  }, [activeReport])

  const fmt = (n: number) => money(n, lang)
  const range = useMemo(
    () => resolveReportRange(period, dateFrom, dateTo),
    [period, dateFrom, dateTo],
  )
  const branchId = activeBranch?.id ?? ''

  const sales = useMemo(() => salesInRange(ledger, range), [ledger, range])
  const voids = useMemo(() => voidsInRange(ledger, range), [ledger, range])
  const discounts = useMemo(() => discountsInRange(ledger, range), [ledger, range])
  const expenses = useMemo(() => expensesInRange(expenseDetails, range), [expenseDetails, range])
  const overview = useMemo(
    () => buildOverview(sales, voids, discounts, expenses),
    [sales, voids, discounts, expenses],
  )
  const daily = useMemo(() => salesByDay(sales, range).filter((d) => d.amount > 0), [sales, range])
  const hourly = useMemo(() => salesByHour(sales).filter((d) => (d.amount ?? 0) > 0 || (d.count ?? 0) > 0), [sales])
  const voidRows = useMemo(() => voidAuditRows(voids), [voids])
  const payments = useMemo(() => paymentBreakdown(sales), [sales])
  const channels = useMemo(() => {
    const rows = channelBreakdown(sales)
    return rows.map((r) => (r.name === 'Other' ? { ...r, name: t.rptOther } : r))
  }, [sales, t.rptOther])
  const items = useMemo(() => {
    const rows = topItems(sales)
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(q))
  }, [sales, query])
  const staff = useMemo(() => staffBreakdown(sales), [sales])
  const expByType = useMemo(
    () =>
      expensesByType(
        expenses,
        (id) => expenseTypes.find((x) => x.id === id)?.name ?? id,
      ),
    [expenses, expenseTypes],
  )
  const cogsInfo = useMemo(() => estimateCogs(sales, dishes), [sales, dishes])
  const grossProfit = overview.salesNet - cogsInfo.cogs
  const netAfterCogs = overview.salesTotal - cogsInfo.cogs - overview.expenseTotal
  const foodCost = useMemo(
    () => foodCostVariance(sales, dishes, stock),
    [sales, dishes, stock],
  )

  const branchStock = useMemo(() => {
    if (!branchId) return []
    return stockForBranch(stock, branchId)
  }, [stock, branchId])

  const stockRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = [...branchStock].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return rows
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.sku ?? '').toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        (s.vendor ?? '').toLowerCase().includes(q),
    )
  }, [branchStock, query])

  const stockValue = useMemo(
    () => branchStock.reduce((sum, s) => sum + s.onHand * s.cost, 0),
    [branchStock],
  )
  const lowStockCount = useMemo(
    () => branchStock.filter((s) => s.onHand <= s.reorderAt).length,
    [branchStock],
  )

  const transferRows = useMemo(() => {
    if (!branchId) return [] as StockTransfer[]
    const q = query.trim().toLowerCase()
    return loadTransfers(branchId)
      .filter((row) => inRange(dayOf(row.createdAt), range))
      .filter((row) => {
        if (!q) return true
        const hay = [
          transferItemName(row),
          row.fromName,
          row.toName,
          row.fromSku,
          row.toSku,
          row.kind,
          row.status,
          row.staff,
          row.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
  }, [branchId, range, query])

  const poRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return purchaseOrders
      .filter((po) => inRange(dayOf(po.createdAt), range))
      .filter((po) => {
        if (!q) return true
        const supplier = suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierId
        const hay = [po.id, po.status, supplier, po.notes].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [purchaseOrders, suppliers, range, query])

  const poOrderedValue = useMemo(() => poRows.reduce((sum, po) => sum + poLineTotal(po), 0), [poRows])

  const pnlTotalIncome = overview.salesTotal
  const pnlTotalExpenses = overview.expenseTotal + cogsInfo.cogs
  const pnlProfitLoss = pnlTotalIncome - pnlTotalExpenses

  const stockPageCount = Math.max(1, Math.ceil(stockRows.length / PAGE_SIZE))
  const safeStockPage = Math.min(stockPage, stockPageCount)
  const pagedStock = useMemo(() => {
    const start = (safeStockPage - 1) * PAGE_SIZE
    return stockRows.slice(start, start + PAGE_SIZE)
  }, [stockRows, safeStockPage])

  const transferPageCount = Math.max(1, Math.ceil(transferRows.length / PAGE_SIZE))
  const safeTransferPage = Math.min(transferPage, transferPageCount)
  const pagedTransfers = useMemo(() => {
    const start = (safeTransferPage - 1) * PAGE_SIZE
    return transferRows.slice(start, start + PAGE_SIZE)
  }, [transferRows, safeTransferPage])

  const poPageCount = Math.max(1, Math.ceil(poRows.length / PAGE_SIZE))
  const safePoPage = Math.min(poPage, poPageCount)
  const pagedPos = useMemo(() => {
    const start = (safePoPage - 1) * PAGE_SIZE
    return poRows.slice(start, start + PAGE_SIZE)
  }, [poRows, safePoPage])

  useEffect(() => {
    setStockPage(1)
    setTransferPage(1)
    setPoPage(1)
  }, [tab, period, dateFrom, dateTo, query, range.from, range.to])

  useEffect(() => {
    if (stockPage > stockPageCount) setStockPage(stockPageCount)
  }, [stockPage, stockPageCount])
  useEffect(() => {
    if (transferPage > transferPageCount) setTransferPage(transferPageCount)
  }, [transferPage, transferPageCount])
  useEffect(() => {
    if (poPage > poPageCount) setPoPage(poPageCount)
  }, [poPage, poPageCount])

  const pagerLabels = {
    ofLabel: t.expensePagerOf,
    prevLabel: t.expensePagerPrev,
    nextLabel: t.expensePagerNext,
  }

  async function exportExcel() {
    if (exporting) return
    setExporting(true)
    try {
      const branchLabel = `${activeBranch?.code ?? ''} ${activeBranch?.name ?? ''}`.trim() || 'branch'
      await downloadReportsWorkbook(
        {
          branchLabel,
          range,
          overview,
          cogs: cogsInfo.cogs,
          grossProfit,
          netAfterExpenses: netAfterCogs,
          daily,
          payments,
          channels,
          items: topItems(sales),
          staff,
          expensesByType: expByType,
          sales,
          expenses,
          stock: stockRows.map((s) => ({
            name: s.name,
            sku: s.sku ?? '',
            category: s.category ?? '',
            unit: s.unit,
            onHand: s.onHand,
            reorderAt: s.reorderAt,
            cost: s.cost,
            value: s.onHand * s.cost,
            vendor: s.vendor ?? '',
          })),
          transfers: transferRows.map((row) => ({
            date: dayOf(row.createdAt),
            item: transferItemName(row),
            kind: row.kind ?? 'location',
            status: row.status ?? '',
            qty: row.qty,
            unit: row.unit,
            from: row.fromBranchName || row.fromLocation || row.fromName || '',
            to: row.toBranchName || row.toLocation || row.toName || '',
            staff: row.staff ?? '',
          })),
          purchaseOrders: poRows.map((po) => ({
            date: dayOf(po.createdAt),
            id: po.id,
            supplier: suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierId,
            status: po.status,
            lines: po.lines.length,
            qtyOrdered: poQtyOrdered(po),
            qtyReceived: poQtyReceived(po),
            amount: poLineTotal(po),
            notes: po.notes ?? '',
          })),
          labels: {
            overview: t.rptTabOverview,
            daily: t.rptDailyTrend,
            payments: t.rptTabPayments,
            channels: t.rptTabChannels,
            items: t.rptTabItems,
            staff: t.rptByStaff,
            expenses: t.rptExpenses,
            salesDetail: t.rptSales,
            stock: t.rptTabStock,
            transfers: t.rptTabStockLogs,
            purchaseOrders: t.rptTabPoLogs,
            metric: t.rptName,
            value: t.rptAmount,
            name: t.rptName,
            amount: t.rptAmount,
            qty: t.rptQty,
            count: t.rptCount,
            day: t.rptDateFrom,
            source: t.rptByChannel,
            method: t.rptByPayment,
            tax: t.rptVat,
            total: t.rptSales,
            staffCol: t.rptByStaff,
            type: t.rptByExpenseType,
            date: t.rptDateFrom,
            description: t.description,
            cogs: t.rptCogs,
            gross: t.rptGrossMargin,
            net: t.rptNetAfterCogs,
            sku: t.rptSku,
            category: t.rptCategory,
            unit: t.rptUnit,
            onHand: t.rptOnHand,
            reorder: t.rptReorder,
            cost: t.rptUnitCost,
            vendor: t.rptVendor,
            kind: t.rptKind,
            status: t.rptStatus,
            from: t.rptFrom,
            to: t.rptTo,
            poId: t.rptPoId,
            supplier: t.rptSupplier,
            lines: t.rptLines,
            qtyOrdered: t.rptQtyOrdered,
            qtyReceived: t.rptQtyReceived,
            notes: t.poNotes,
          },
        },
        `mesa-reports_${range.from}_${range.to}.xlsx`,
      )
      flash(t.rptExportOk)
    } catch {
      flash(t.rptExportFail, 'err')
    } finally {
      setExporting(false)
    }
  }

  if (!canAccess) {
    return <AccessDenied pathname="/reports" />
  }

  const hubReports = useMemo(() => {
    const q = query.trim().toLowerCase()
    return REPORT_DEFS.filter((def) => {
      if (hubCategory === 'favorites') return favorites.has(def.id)
      if (hubCategory !== 'all' && def.category !== hubCategory) return false
      if (!q) return true
      const name = String(t[def.nameKey] ?? '').toLowerCase()
      const cat = String(t[REPORT_CATEGORY_LABEL[def.category]] ?? '').toLowerCase()
      return name.includes(q) || cat.includes(q)
    })
  }, [favorites, hubCategory, query, t])

  function openReport(id: ReportId) {
    patchSearch({ report: id }, false)
    setVisits(markReportVisited(id))
  }

  function closeReport() {
    patchSearch({ report: null }, false)
  }

  function toggleFavorite(id: ReportId) {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveReportFavorites(next)
      return next
    })
  }

  function formatVisit(iso?: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const periodOptions = [
    { value: 'today', label: t.rptPeriodToday },
    { value: '7d', label: t.rptPeriod7d },
    { value: '30d', label: t.rptPeriod30d },
    { value: 'month', label: t.rptPeriodMonth },
    { value: 'custom', label: t.rptPeriodCustom },
  ]

  const salesMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptSales, value: overview.salesTotal, tone: 'teal' },
    { label: t.rptVat, value: overview.taxTotal, tone: 'ocean' },
    { label: t.rptTickets, value: overview.ticketCount, tone: 'slate', raw: true },
    { label: t.rptAvgTicket, value: overview.avgTicket, tone: 'amber' },
  ]

  const pnlMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptSales, value: overview.salesTotal, tone: 'teal' },
    { label: t.rptCogs, value: cogsInfo.cogs, tone: 'violet' },
    { label: t.rptGrossMargin, value: grossProfit, tone: grossProfit >= 0 ? 'lime' : 'rose' },
    { label: t.rptExpenses, value: overview.expenseTotal, tone: 'rose' },
    {
      label: t.rptNetAfterCogs,
      value: netAfterCogs,
      tone: netAfterCogs >= 0 ? 'lime' : 'rose',
    },
  ]

  const stockMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptStockSkus, value: branchStock.length, tone: 'slate', raw: true },
    { label: t.rptStockValue, value: stockValue, tone: 'teal' },
    { label: t.rptLowStock, value: lowStockCount, tone: lowStockCount ? 'rose' : 'lime', raw: true },
  ]

  const stockLogMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptStockMoves, value: transferRows.length, tone: 'ocean', raw: true },
    {
      label: t.rptStockLogReceived,
      value: transferRows.filter((r) => {
        const s = r.status ?? ''
        return s === 'received' || s === 'completed'
      }).length,
      tone: 'lime',
      raw: true,
    },
    {
      label: t.rptStockLogPending,
      value: transferRows.filter((r) => {
        const s = r.status
        return s === 'in_transit' || s === 'requested'
      }).length,
      tone: 'amber',
      raw: true,
    },
    {
      label: t.rptStockLogBranch,
      value: transferRows.filter((r) => (r.kind ?? '') === 'branch').length,
      tone: 'slate',
      raw: true,
    },
  ]

  const poMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptPoCount, value: poRows.length, tone: 'slate', raw: true },
    { label: t.rptPoOrderedValue, value: poOrderedValue, tone: 'teal' },
    {
      label: t.rptPoReceived,
      value: poRows.filter((p) => p.status === 'received').length,
      tone: 'lime',
      raw: true,
    },
    {
      label: t.rptPoOpen,
      value: poRows.filter((p) => p.status === 'ordered' || p.status === 'partial' || p.status === 'draft')
        .length,
      tone: 'amber',
      raw: true,
    },
  ]

  const foodCostMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptMenuCost, value: foodCost.menuCogs, tone: 'violet' },
    { label: t.rptRecipeCost, value: foodCost.recipeCogs, tone: 'ocean' },
    {
      label: t.rptCostVariance,
      value: foodCost.variance,
      tone: foodCost.variance >= 0 ? 'amber' : 'lime',
    },
    { label: t.rptTickets, value: foodCost.rows.length, tone: 'slate', raw: true },
  ]

  const voidMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptVoids, value: overview.voidTotal, tone: 'rose' },
    { label: t.rptCount, value: voidRows.length, tone: 'slate', raw: true },
  ]

  const hourlyMetrics: { label: string; value: number; tone: string; raw?: boolean }[] = [
    { label: t.rptSales, value: overview.salesTotal, tone: 'teal' },
    {
      label: t.rptCount,
      value: hourly.reduce((n, h) => n + (h.count ?? 0), 0),
      tone: 'slate',
      raw: true,
    },
  ]

  const metrics =
    tab === 'stock'
      ? stockMetrics
      : tab === 'stockLogs'
        ? stockLogMetrics
        : tab === 'poLogs'
          ? poMetrics
          : tab === 'pnl'
            ? pnlMetrics
            : tab === 'foodCost'
              ? foodCostMetrics
              : tab === 'voids'
                ? voidMetrics
                : tab === 'hourly'
                  ? hourlyMetrics
                  : salesMetrics

  function statusLabel(status: string) {
    const map: Record<string, string> = {
      draft: t.rptStatusDraft,
      ordered: t.rptStatusOrdered,
      partial: t.rptStatusPartial,
      received: t.rptStatusReceived,
      cancelled: t.rptStatusCancelled,
      requested: t.rptStatusRequested,
      in_transit: t.rptStatusInTransit,
      completed: t.rptStatusCompleted,
    }
    return map[status] ?? status
  }

  function kindLabel(kind: string) {
    const map: Record<string, string> = {
      location: t.rptKindLocation,
      branch: t.rptKindBranch,
      production: t.rptKindProduction,
    }
    return map[kind] ?? kind
  }

  const activeDef = activeReport ? REPORT_DEFS.find((d) => d.id === activeReport) : null

  return (
    <div className={`zk-rpt${activeReport ? ' is-detail' : ' is-hub'}`}>
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      {!activeReport ? (
        <div className="rpt-hub">
          <aside className="rpt-hub-side" aria-label={t.rptTitle}>
            <p className="rpt-hub-side-kicker">{t.rptCatGeneral}</p>
            <nav className="rpt-hub-nav">
              {REPORT_CATEGORY_ORDER.filter((c) => c === 'all' || c === 'favorites').map((id) => (
                <button
                  key={id}
                  type="button"
                  className={hubCategory === id ? 'on' : ''}
                  onClick={() => setHubCategory(id)}
                >
                  <span className="rpt-hub-nav-ico" aria-hidden>
                    {id === 'favorites' ? '★' : '⌂'}
                  </span>
                  {t[REPORT_CATEGORY_LABEL[id]]}
                  {id === 'favorites' ? (
                    <em className="mesa-ltr-nums">{favorites.size}</em>
                  ) : (
                    <em className="mesa-ltr-nums">{REPORT_DEFS.length}</em>
                  )}
                </button>
              ))}
            </nav>
            <p className="rpt-hub-side-kicker">{t.rptCatReportCategory}</p>
            <nav className="rpt-hub-nav">
              {REPORT_CATEGORY_ORDER.filter((c) => c !== 'all' && c !== 'favorites').map((id) => {
                const count = REPORT_DEFS.filter((d) => d.category === id).length
                return (
                  <button
                    key={id}
                    type="button"
                    className={hubCategory === id ? 'on' : ''}
                    onClick={() => setHubCategory(id)}
                  >
                    <span className="rpt-hub-nav-folder" aria-hidden />
                    {t[REPORT_CATEGORY_LABEL[id]]}
                    <em className="mesa-ltr-nums">{count}</em>
                  </button>
                )
              })}
            </nav>
          </aside>

          <section className="rpt-hub-main">
            <header className="rpt-hub-head">
              <h1>
                {hubCategory === 'all'
                  ? t.rptAllReports
                  : t[REPORT_CATEGORY_LABEL[hubCategory]]}
                <span className="rpt-hub-count mesa-ltr-nums">{hubReports.length}</span>
              </h1>
              <p>{t.rptHubHint}</p>
            </header>

            <div className="rpt-hub-table-wrap">
              <table className="rpt-hub-table">
                <thead>
                  <tr>
                    <th>{t.rptColName}</th>
                    <th>{t.rptColCategory}</th>
                    <th>{t.rptColCreatedBy}</th>
                    <th>{t.rptColLastVisited}</th>
                  </tr>
                </thead>
                <tbody>
                  {hubReports.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="rpt-empty">
                          <strong>{t.rptEmpty}</strong>
                          <span>{t.rptHubEmptyHint}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    hubReports.map((def) => (
                      <tr key={def.id}>
                        <td>
                          <div className="rpt-hub-name">
                            <button
                              type="button"
                              className={`rpt-fav${favorites.has(def.id) ? ' on' : ''}`}
                              aria-label={t.rptCatFavorites}
                              onClick={() => toggleFavorite(def.id)}
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              className="rpt-hub-link"
                              onClick={() => openReport(def.id)}
                            >
                              {t[def.nameKey]}
                            </button>
                          </div>
                        </td>
                        <td>{t[REPORT_CATEGORY_LABEL[def.category]]}</td>
                        <td>{t.rptSystemGenerated}</td>
                        <td className="mesa-ltr-nums">{formatVisit(visits[def.id])}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
      <div className="rpt-page" ref={printRootRef}>
        <header className="rpt-hero">
          <div className="rpt-hero-copy">
            <button
              type="button"
              className="rpt-back no-print"
              onClick={closeReport}
            >
              ← {t.rptAllReports}
            </button>
            <span className="rpt-hero-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 19V5" />
                <path d="M4 19h16" />
                <path d="M8 15v-4M12 15V8M16 15v-7" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h1>{activeDef ? t[activeDef.nameKey] : t.rptTitle}</h1>
              <p>
                {activeDef ? t[activeDef.hintKey] : t.rptHint}
                {activeBranch?.code ? (
                  <>
                    {' '}
                    · <span className="mesa-ltr-nums">{activeBranch.code}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="rpt-hero-actions no-print">
            <span className="rpt-range mesa-ltr-nums">
              {formatDayLabel(range.from, lang)}
              {range.from !== range.to ? ` → ${formatDayLabel(range.to, lang)}` : ''}
            </span>
            <button
              type="button"
              className="rpt-btn"
              onClick={() => void exportExcel()}
              disabled={exporting}
            >
              {exporting ? t.rptExporting : t.rptExportExcel}
            </button>
            <button
              type="button"
              className="rpt-btn primary"
              onClick={() => {
                const root = printRootRef.current
                if (!root) return
                const rangeLabel =
                  range.from === range.to
                    ? formatDayLabel(range.from, lang)
                    : `${formatDayLabel(range.from, lang)} → ${formatDayLabel(range.to, lang)}`
                const subtitle = [
                  activeDef ? t[activeDef.hintKey] : t.rptHint,
                  activeBranch?.code ? activeBranch.code : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
                void printReportFromElement({
                  title: activeDef ? t[activeDef.nameKey] : t.rptTitle,
                  subtitle,
                  rangeLabel,
                  source: root,
                  dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
                  lang,
                }).then((res) => {
                  if (!res.ok) flash(t.printingBlocked, 'err')
                })
              }}
            >
              {t.rptPrintPdf}
            </button>
          </div>
        </header>

        <div className="rpt-toolbar no-print">
          <div className="rpt-period" role="tablist" aria-label={t.rptTitle}>
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                className={period === opt.value ? 'on' : ''}
                aria-selected={period === opt.value}
                onClick={() => setPeriod(opt.value as ReportPeriod)}
              >
                {opt.label}
              </button>
            ))}
            {period === 'custom' ? (
              <div className="rpt-custom">
                <label>
                  <span>{t.rptDateFrom}</span>
                  <input
                    className="mesa-ltr-nums"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t.rptDateTo}</span>
                  <input
                    className="mesa-ltr-nums"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rpt-metrics">
          {metrics.map((m) => (
            <article key={m.label} className={`rpt-metric tone-${m.tone}`}>
              <span>{m.label}</span>
              <strong className="mesa-ltr-nums">
                {m.raw ? String(m.value) : fmt(m.value as number)}
              </strong>
            </article>
          ))}
        </div>

        <div className="rpt-body">
          <section className="rpt-panel">
            {tab === 'overview' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptDailyTrend}</h2>
                  <span className="mesa-ltr-nums">{fmt(overview.salesTotal)}</span>
                </div>
                <AmountTable
                  rows={daily.map((d) => ({
                    name: formatDayLabel(d.name, lang),
                    amount: d.amount,
                  }))}
                  fmt={fmt}
                  nameLabel={t.rptDateFrom}
                  amountLabel={t.rptAmount}
                  empty={t.rptEmpty}
                  emptyHint={t.rptEmptyHint}
                />
              </>
            ) : null}

            {tab === 'hourly' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabHourly}</h2>
                </div>
                <AmountTable
                  rows={hourly}
                  fmt={fmt}
                  nameLabel={t.rptTabHourly}
                  amountLabel={t.rptAmount}
                  showCount
                  countLabel={t.rptCount}
                  empty={t.rptEmpty}
                  emptyHint={t.rptEmptyHint}
                />
              </>
            ) : null}

            {tab === 'voids' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabVoids}</h2>
                  <span className="mesa-ltr-nums">{fmt(overview.voidTotal)}</span>
                </div>
                {voidRows.length === 0 ? (
                  <p className="rpt-muted">{t.rptEmptyHint}</p>
                ) : (
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        <th>{t.rptDateFrom}</th>
                        <th>{t.rptByChannel}</th>
                        <th>{t.rptVoidItem}</th>
                        <th>{t.rptVoidReason}</th>
                        <th>{t.rptByStaff}</th>
                        <th>{t.rptAmount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voidRows.map((row) => (
                        <tr key={`${row.at}-${row.item}-${row.amount}`}>
                          <td className="mesa-ltr-nums">{formatVisit(row.at)}</td>
                          <td>{row.source}</td>
                          <td>{row.item}</td>
                          <td>{row.reason}</td>
                          <td>{row.staff}</td>
                          <td className="mesa-ltr-nums">{fmt(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}

            {tab === 'foodCost' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabFoodCost}</h2>
                  <span className={`rpt-profit mesa-ltr-nums${foodCost.variance < 0 ? ' neg' : ''}`}>
                    {fmt(foodCost.variance)}
                  </span>
                </div>
                <p className="rpt-muted rpt-cogs-hint">{t.rptFoodCostHint}</p>
                {foodCost.rows.length === 0 ? (
                  <p className="rpt-muted">{t.rptEmptyHint}</p>
                ) : (
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        <th>{t.rptName}</th>
                        <th>{t.rptQty}</th>
                        <th>{t.rptSales}</th>
                        <th>{t.rptMenuCost}</th>
                        <th>{t.rptRecipeCost}</th>
                        <th>{t.rptCostVariance}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foodCost.rows.slice(0, 50).map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="mesa-ltr-nums">{row.qty}</td>
                          <td className="mesa-ltr-nums">{fmt(row.revenue)}</td>
                          <td className="mesa-ltr-nums">{fmt(row.menuCost)}</td>
                          <td className="mesa-ltr-nums">{fmt(row.recipeCost)}</td>
                          <td className="mesa-ltr-nums">{fmt(row.variance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}

            {tab === 'payments' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptByPayment}</h2>
                </div>
                <AmountTable
                  rows={payments}
                  fmt={fmt}
                  nameLabel={t.rptName}
                  amountLabel={t.rptAmount}
                  empty={t.rptEmpty}
                  emptyHint={t.rptEmptyHint}
                />
              </>
            ) : null}

            {tab === 'channels' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptByChannel}</h2>
                </div>
                <AmountTable
                  rows={channels}
                  fmt={fmt}
                  nameLabel={t.rptName}
                  amountLabel={t.rptAmount}
                  showCount
                  countLabel={t.rptCount}
                  empty={t.rptEmpty}
                  emptyHint={t.rptEmptyHint}
                />
              </>
            ) : null}

            {tab === 'items' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTopItems}</h2>
                </div>
                <AmountTable
                  rows={items}
                  fmt={fmt}
                  nameLabel={t.rptName}
                  amountLabel={t.rptAmount}
                  showQty
                  qtyLabel={t.rptQty}
                  empty={t.rptEmpty}
                  emptyHint={t.rptEmptyHint}
                />
              </>
            ) : null}

            {tab === 'pnl' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabPnL}</h2>
                  <span className={`rpt-profit mesa-ltr-nums${pnlProfitLoss < 0 ? ' neg' : ''}`}>
                    {fmt(pnlProfitLoss)}
                  </span>
                </div>
                <p className="rpt-muted rpt-cogs-hint">{t.rptCogsHint}</p>
                {cogsInfo.unmatchedLines > 0 ? (
                  <p className="rpt-muted">
                    {t.rptCogsUnmatched.replace('{count}', String(cogsInfo.unmatchedLines))}
                  </p>
                ) : null}

                <div className="rpt-pnl-sheet">
                  <p className="rpt-pnl-period">
                    {t.rptPnLPeriodEnded}{' '}
                    <strong className="mesa-ltr-nums">
                      {range.from === range.to
                        ? formatDayLabel(range.from, lang)
                        : `${formatDayLabel(range.from, lang)} → ${formatDayLabel(range.to, lang)}`}
                    </strong>
                  </p>

                  <table className="rpt-pnl-classic">
                    <thead>
                      <tr>
                        <th scope="col">{t.rptName}</th>
                        <th scope="col" className="mesa-ltr-nums">
                          {t.rptPnLDetailCol}
                        </th>
                        <th scope="col" className="mesa-ltr-nums">
                          {t.rptPnLTotalCol}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="rpt-pnl-section">
                        <td colSpan={3}>
                          <strong>{t.rptPnLIncome}</strong>
                        </td>
                      </tr>
                      <tr className="rpt-pnl-item">
                        <td>{t.rptSales}</td>
                        <td className="mesa-ltr-nums">{fmt(overview.salesTotal)}</td>
                        <td />
                      </tr>
                      <tr className="rpt-pnl-item">
                        <td>{t.rptNet}</td>
                        <td className="mesa-ltr-nums">{fmt(overview.salesNet)}</td>
                        <td />
                      </tr>
                      <tr className="rpt-pnl-item">
                        <td>{t.rptVat}</td>
                        <td className="mesa-ltr-nums">{fmt(overview.taxTotal)}</td>
                        <td />
                      </tr>
                      {overview.discountTotal > 0 ? (
                        <tr className="rpt-pnl-item is-deduct">
                          <td>{t.rptDiscounts}</td>
                          <td className="mesa-ltr-nums">({fmt(overview.discountTotal)})</td>
                          <td />
                        </tr>
                      ) : null}
                      {overview.voidTotal > 0 ? (
                        <tr className="rpt-pnl-item is-deduct">
                          <td>{t.rptVoids}</td>
                          <td className="mesa-ltr-nums">({fmt(overview.voidTotal)})</td>
                          <td />
                        </tr>
                      ) : null}
                      <tr className="rpt-pnl-total">
                        <td>
                          <strong>{t.rptPnLTotalIncome}</strong>
                        </td>
                        <td />
                        <td className="mesa-ltr-nums">
                          <strong>{fmt(pnlTotalIncome)}</strong>
                        </td>
                      </tr>

                      <tr className="rpt-pnl-spacer">
                        <td colSpan={3} />
                      </tr>

                      <tr className="rpt-pnl-section">
                        <td colSpan={3}>
                          <strong>{t.rptPnLExpensesSection}</strong>
                        </td>
                      </tr>
                      {expByType.length ? (
                        expByType.map((row) => (
                          <tr key={row.name} className="rpt-pnl-item">
                            <td>{row.name}</td>
                            <td className="mesa-ltr-nums">{fmt(row.amount)}</td>
                            <td />
                          </tr>
                        ))
                      ) : (
                        <tr className="rpt-pnl-item is-muted">
                          <td colSpan={3}>{t.rptEmpty}</td>
                        </tr>
                      )}
                      <tr className="rpt-pnl-item">
                        <td>{t.rptPnLCogsLine}</td>
                        <td className="mesa-ltr-nums">{fmt(cogsInfo.cogs)}</td>
                        <td />
                      </tr>
                      <tr className="rpt-pnl-total">
                        <td>
                          <strong>{t.rptPnLTotalExpenses}</strong>
                        </td>
                        <td />
                        <td className="mesa-ltr-nums">
                          <strong>{fmt(pnlTotalExpenses)}</strong>
                        </td>
                      </tr>

                      <tr className="rpt-pnl-spacer">
                        <td colSpan={3} />
                      </tr>

                      <tr className={`rpt-pnl-result${pnlProfitLoss < 0 ? ' is-neg' : ''}`}>
                        <td>
                          <strong>{t.rptPnLProfitLoss}</strong>
                        </td>
                        <td />
                        <td className="mesa-ltr-nums">
                          <strong>{fmt(pnlProfitLoss)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {tab === 'stock' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptStockOnHand}</h2>
                  <span className="mesa-ltr-nums">{fmt(stockValue)}</span>
                </div>
                <p className="rpt-muted rpt-panel-lead">{t.rptStockSummaryHint}</p>
                {stockRows.length ? (
                  <PaginatedTable
                    total={stockRows.length}
                    page={safeStockPage}
                    onPage={setStockPage}
                    {...pagerLabels}
                  >
                    <table className="rpt-table">
                      <thead>
                        <tr>
                          <th>{t.rptName}</th>
                          <th>{t.rptSku}</th>
                          <th>{t.rptCategory}</th>
                          <th>{t.rptOnHand}</th>
                          <th>{t.rptReorder}</th>
                          <th>{t.rptUnitCost}</th>
                          <th>{t.rptAmount}</th>
                          <th>{t.rptVendor}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedStock.map((s) => {
                          const low = s.onHand <= s.reorderAt
                          return (
                            <tr key={s.id} className={low ? 'rpt-row-warn' : undefined}>
                              <td>
                                <strong>{s.name}</strong>
                                {low ? <em className="rpt-pill warn">{t.rptLowStock}</em> : null}
                              </td>
                              <td className="mesa-ltr-nums">{s.sku || '—'}</td>
                              <td>{s.category || '—'}</td>
                              <td className="mesa-ltr-nums">
                                {s.onHand} {s.unit}
                              </td>
                              <td className="mesa-ltr-nums">{s.reorderAt}</td>
                              <td className="mesa-ltr-nums">{fmt(s.cost)}</td>
                              <td className="mesa-ltr-nums">{fmt(s.onHand * s.cost)}</td>
                              <td>{s.vendor || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </PaginatedTable>
                ) : (
                  <div className="rpt-empty">
                    <strong>{t.rptEmpty}</strong>
                    <span>{t.rptStockEmptyHint}</span>
                  </div>
                )}
              </>
            ) : null}

            {tab === 'stockLogs' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabStockLogs}</h2>
                  <span className="mesa-ltr-nums">{transferRows.length}</span>
                </div>
                <p className="rpt-muted rpt-panel-lead">{t.rptStockLogsHint}</p>
                {transferRows.length ? (
                  <PaginatedTable
                    total={transferRows.length}
                    page={safeTransferPage}
                    onPage={setTransferPage}
                    {...pagerLabels}
                  >
                    <table className="rpt-table">
                      <thead>
                        <tr>
                          <th>{t.rptDateFrom}</th>
                          <th>{t.rptName}</th>
                          <th>{t.rptKind}</th>
                          <th>{t.rptStatus}</th>
                          <th>{t.rptQty}</th>
                          <th>{t.rptFrom}</th>
                          <th>{t.rptTo}</th>
                          <th>{t.rptByStaff}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTransfers.map((row) => (
                          <tr key={row.id}>
                            <td className="mesa-ltr-nums">{formatDayLabel(row.createdAt, lang)}</td>
                            <td>
                              <strong>{transferItemName(row)}</strong>
                            </td>
                            <td>{kindLabel(row.kind ?? 'location')}</td>
                            <td>{statusLabel(row.status ?? '')}</td>
                            <td className="mesa-ltr-nums">
                              {row.qty} {row.unit}
                            </td>
                            <td>{row.fromBranchName || row.fromLocation || row.fromName || '—'}</td>
                            <td>{row.toBranchName || row.toLocation || row.toName || '—'}</td>
                            <td>{row.staff || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PaginatedTable>
                ) : (
                  <div className="rpt-empty">
                    <strong>{t.rptEmpty}</strong>
                    <span>{t.rptStockLogsEmptyHint}</span>
                  </div>
                )}
              </>
            ) : null}

            {tab === 'poLogs' ? (
              <>
                <div className="rpt-panel-head">
                  <h2>{t.rptTabPoLogs}</h2>
                  <span className="mesa-ltr-nums">{fmt(poOrderedValue)}</span>
                </div>
                {poRows.length ? (
                  <PaginatedTable
                    total={poRows.length}
                    page={safePoPage}
                    onPage={setPoPage}
                    {...pagerLabels}
                  >
                    <table className="rpt-table">
                      <thead>
                        <tr>
                          <th>{t.rptDateFrom}</th>
                          <th>{t.rptPoId}</th>
                          <th>{t.rptSupplier}</th>
                          <th>{t.rptStatus}</th>
                          <th>{t.rptLines}</th>
                          <th>{t.rptQtyOrdered}</th>
                          <th>{t.rptQtyReceived}</th>
                          <th>{t.rptAmount}</th>
                          <th>{t.poNotes}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedPos.map((po) => (
                          <tr key={po.id}>
                            <td className="mesa-ltr-nums">{formatDayLabel(po.createdAt, lang)}</td>
                            <td className="mesa-ltr-nums">
                              <strong>{po.id}</strong>
                            </td>
                            <td>
                              {suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierId}
                            </td>
                            <td>
                              <em className={`rpt-pill status-${po.status}`}>
                                {statusLabel(po.status)}
                              </em>
                            </td>
                            <td className="mesa-ltr-nums">{po.lines.length}</td>
                            <td className="mesa-ltr-nums">{poQtyOrdered(po)}</td>
                            <td className="mesa-ltr-nums">{poQtyReceived(po)}</td>
                            <td className="mesa-ltr-nums">{fmt(poLineTotal(po))}</td>
                            <td>{po.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PaginatedTable>
                ) : (
                  <div className="rpt-empty">
                    <strong>{t.rptEmpty}</strong>
                    <span>{t.rptPoEmptyHint}</span>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>
      )}

      <HubFooter
        leading={
          activeReport ? (
            <button type="button" className="zk-hub-back" onClick={closeReport}>
              <span className="zk-hub-back-arrow" aria-hidden>
                ←
              </span>
              {t.rptAllReports}
            </button>
          ) : undefined
        }
        backTo="/"
        backLabel={t.home}
        primaryTo="/"
        primaryLabel={t.mainMenu}
      />
    </div>
  )
}
