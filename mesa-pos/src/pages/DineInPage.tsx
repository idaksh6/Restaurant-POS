import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ConfirmModal from '../components/ConfirmModal'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import MenuPicker from '../components/MenuPicker'
import QtyStepper from '../components/QtyStepper'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { ITEM_NOTE_SUGGESTIONS } from '../data/itemNotes'
import { inactiveAreaNameSet, loadTableAreas, orderedAreaNames } from '../data/tableAreas'
import { lineTotal, money, nowTime, type OrderLine } from '../data/mock'
import { calcBill, calcBillWithFoodVoucher, cashFromSettle, recipesFromDishes, settleAfterFoodVoucher } from '../lib/bill'
import { companyDefaultTaxPercent, dishTaxPercent, normalizeTaxIds, orderTaxBillOptions, taxBreakdownForOrder, vatDisplayLabel, vatRateLabel } from '../data/tax'
import { localizedAreaName, localizedLineName } from '../lib/branding'
import { lineNameWithoutOptions, parseOrderLineNote } from '../lib/orderLineOptions'
import { floorDiscountPercents } from '../data/discount'
import { assignGuestsOnOpen, POS_PREFS_EVENT } from '../data/posPrefs'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'
import TableIcon from '../components/TableIcon'
import DineTableTile from '../components/DineTableTile'
import FloorDiagram from '../components/FloorDiagram'

const FLOOR_VIEW_KEY = 'mesa-floor-view'

function readFloorView(): 'list' | 'diagram' {
  try {
    const v = sessionStorage.getItem(FLOOR_VIEW_KEY)
    if (v === 'diagram' || v === 'list') return v
  } catch {
    /* ignore */
  }
  return 'list'
}

export default function DineInPage() {
  const { user } = useAuth()
  const { activeBranchId, company } = useBranch()
  const { t, lang } = useI18n()
  const [searchParams] = useSearchParams()
  const serverMode =
    searchParams.get('mode') === 'server' || user?.role === 'food-server'
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, discounts, taxes } = useCatalog()
  const discountPicks = useMemo(() => floorDiscountPercents(discounts), [discounts])
  const { addCashIn } = useShift()
  const {
    tables,
    tableOrders,
    openTable,
    setGuests,
    selectAddToTable,
    changeTableQty,
    setTableLineNote,
    setTableTicketNote,
    voidTableLine,
    sendTableOrders,
    transferTable,
    mergeTables,
    tableDiscounts,
    tableTicketNotes,
    setTableDiscount,
    chargeCatalog,
    tableCharges,
    toggleTableCharge,
    getTableChargeLines,
    requestBill,
    settleTable,
    clearEmptyTable,
    deductRecipeStock,
    dayIsClosed,
    flash,
    tickets,
  } = usePos()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [clearEmptyId, setClearEmptyId] = useState<string | null>(null)
  const [settlePreset, setSettlePreset] = useState<'Cash' | 'mada' | 'Split bill' | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [floorTab, setFloorTab] = useState<'all' | 'unsettled' | 'customers'>('all')
  const [floorView, setFloorView] = useState<'list' | 'diagram'>(readFloorView)
  const [areaFilter, setAreaFilter] = useState<string | 'all'>('all')
  const [floorQuery, setFloorQuery] = useState('')
  const [ticketNote, setTicketNote] = useState('')
  const [showCustomerPick, setShowCustomerPick] = useState(false)
  const [customerPickSource, setCustomerPickSource] = useState<'floor' | 'ticket'>('ticket')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<{ tableId: string; lineId: string; name: string } | null>(
    null,
  )
  const [noteTarget, setNoteTarget] = useState<{
    tableId: string
    lineId: string
    name: string
    note: string
  } | null>(null)
  const [showTicketNotePrompt, setShowTicketNotePrompt] = useState(false)
  const [orderSheetExpanded, setOrderSheetExpanded] = useState(false)
  const [clearAllPending, setClearAllPending] = useState<OrderLine[] | null>(null)
  const [seatAssignEnabled, setSeatAssignEnabled] = useState(() => assignGuestsOnOpen())
  const [areasTick, setAreasTick] = useState(0)

  useEffect(() => {
    const tableId = searchParams.get('table')
    if (!tableId) return
    const table = tables.find((t) => t.id === tableId)
    if (!table || table.status === 'free') return
    setSelectedId(tableId)
    setTicketOpen(true)
  }, [searchParams, tables])

  useEffect(() => {
    const sync = () => setSeatAssignEnabled(assignGuestsOnOpen())
    window.addEventListener(POS_PREFS_EVENT, sync)
    return () => window.removeEventListener(POS_PREFS_EVENT, sync)
  }, [])

  useEffect(() => {
    const onAreas = () => setAreasTick((n) => n + 1)
    window.addEventListener('mesa:table-areas-changed', onAreas)
    return () => window.removeEventListener('mesa:table-areas-changed', onAreas)
  }, [])

  useEffect(() => {
    setAreasTick((n) => n + 1)
  }, [activeBranchId])

  const areaCatalog = useMemo(
    () => loadTableAreas(activeBranchId),
    [activeBranchId, areasTick],
  )
  const inactiveAreas = useMemo(() => inactiveAreaNameSet(areaCatalog), [areaCatalog])

  /** Floor hides tables whose dining area is inactive. */
  const floorTables = useMemo(
    () => tables.filter((table) => !inactiveAreas.has(table.area.trim().toLowerCase())),
    [tables, inactiveAreas],
  )

  const tableAreas = useMemo(
    () => orderedAreaNames(
      floorTables.map((table) => table.area).filter(Boolean),
      areaCatalog,
    ),
    [floorTables, areaCatalog],
  )

  useEffect(() => {
    if (areaFilter !== 'all' && inactiveAreas.has(areaFilter.trim().toLowerCase())) {
      setAreaFilter('all')
    }
  }, [areaFilter, inactiveAreas])

  const rolePerms = user ? getPermissions(user.role) : getPermissions('food-server')
  const perms = serverMode
    ? {
        ...rolePerms,
        ...getPermissions('food-server'),
        // Keep role nav/label; force Food Server action rights on this screen
        canSettle: false,
        canOpenTable: true,
        canSendOrders: true,
        canChangeTable: true,
        canTempBill: true,
      }
    : rolePerms

  const selected = selectedId ? tables.find((t) => t.id === selectedId) : undefined
  const syncedTicketNote = selected ? tableTicketNotes[selected.id] ?? '' : ''

  useEffect(() => {
    setTicketNote(syncedTicketNote)
  }, [selected?.id, syncedTicketNote])

  const ticketVisible =
    ticketOpen &&
    !!selected &&
    (selected.status === 'occupied' || selected.status === 'billing')
  const pendingOpen = pendingOpenId ? tables.find((t) => t.id === pendingOpenId) : null
  const lines = selected ? tableOrders[selected.id] ?? [] : []
  const pending = lines.filter((line) => !line.sent).length
  const rawSubtotal = lineTotal(lines)
  const discountPct = selected ? tableDiscounts[selected.id] ?? 0 : 0
  const chargeLines = selected ? getTableChargeLines(selected.id, rawSubtotal) : []
  const taxEnabled = company.enableTax !== false
  const bill = useMemo(
    () =>
      calcBill(
        rawSubtotal,
        discountPct,
        chargeLines,
        orderTaxBillOptions(lines, dishes, taxes, taxEnabled),
      ),
    [rawSubtotal, discountPct, chargeLines, lines, dishes, taxes, taxEnabled],
  )
  const { discountAmt, tax, total, taxByRate } = bill
  const vatDetailRows = useMemo(
    () =>
      taxBreakdownForOrder({
        lines,
        dishes,
        taxes,
        discountPct,
        charges: chargeLines,
        enableTax: taxEnabled,
        taxByRate,
      }),
    [lines, dishes, taxes, discountPct, chargeLines, taxEnabled, taxByRate],
  )
  const defaultTaxPct = companyDefaultTaxPercent(taxes)
  const vatLabel = useMemo(
    () =>
      vatDisplayLabel(
        defaultTaxPct,
        taxByRate.length > 1 ||
          lines.some((l) => {
            const dish = dishes.find((d) => d.id === l.itemId)
            return dishTaxPercent(dish?.taxIds, taxes) !== defaultTaxPct
          }),
      ),
    [defaultTaxPct, taxByRate.length, lines, dishes, taxes],
  )

  const handleMenuAdd = useCallback(
    (item: Parameters<typeof selectAddToTable>[1], note?: string) => {
      if (!selectedId) return
      selectAddToTable(selectedId, item, note)
    },
    [selectedId, selectAddToTable],
  )

  /** Occupied (combine bills) + free (link seating as MERGED) — exclude already-merged. */
  const mergeTargets = floorTables.filter(
    (t) =>
      t.id !== selectedId &&
      t.status !== 'merged' &&
      (t.status === 'free' ||
        t.status === 'reserved' ||
        t.status === 'occupied' ||
        t.status === 'billing'),
  )

  const mergeTargetsByArea = useMemo(() => {
    const byArea = new Map<string, typeof mergeTargets>()
    for (const table of mergeTargets) {
      const area = table.area || 'Other'
      const list = byArea.get(area) ?? []
      list.push(table)
      byArea.set(area, list)
    }
    const preferred = selected?.area
    const ordered = [
      ...(preferred && byArea.has(preferred) ? [preferred] : []),
      ...tableAreas.filter((name) => name !== preferred && byArea.has(name)),
      ...[...byArea.keys()].filter((name) => name !== preferred && !tableAreas.includes(name)),
    ]
    const statusRank = (status: string) =>
      status === 'billing' || status === 'occupied' ? 0 : status === 'reserved' ? 1 : 2
    return ordered.map((name) => ({
      name,
      tables: (byArea.get(name) ?? []).slice().sort((a, b) => {
        const byStatus = statusRank(a.status) - statusRank(b.status)
        if (byStatus) return byStatus
        return a.label.localeCompare(b.label, undefined, { numeric: true })
      }),
      sameArea: name === preferred,
    }))
  }, [mergeTargets, tableAreas, selected?.area])

  const floorStats = useMemo(() => {
    const free = floorTables.filter((t) => t.status === 'free').length
    const occupied = floorTables.filter((t) => t.status === 'occupied').length
    const billing = floorTables.filter((t) => t.status === 'billing').length
    const merged = floorTables.filter((t) => t.status === 'merged').length
    const covers = floorTables.reduce(
      (sum, t) => sum + (t.status === 'free' ? 0 : t.guests ?? 0),
      0,
    )
    return { free, occupied, billing, merged, covers }
  }, [floorTables])

  const floorQueryNorm = floorQuery.trim().toLowerCase()

  function tableMatchesQuery(table: (typeof tables)[number]) {
    if (!floorQueryNorm) return true
    const hay = [
      table.label,
      `t${table.label}`,
      `t${table.label}-${table.seats}`,
      table.area,
      tableStatusLabel(table.status),
      String(table.seats),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(floorQueryNorm)
  }

  const areaSections = useMemo(
    () =>
      tableAreas
        .map((name) => ({
          name,
          tables: floorTables.filter((table) => table.area === name && tableMatchesQuery(table)),
        }))
        .filter((section) => section.tables.length > 0),
    [floorTables, floorQueryNorm, tableAreas],
  )

  const visibleTables = useMemo(() => {
    let list = floorTables.filter(tableMatchesQuery)
    if (areaFilter !== 'all') list = list.filter((table) => table.area === areaFilter)
    if (floorTab === 'unsettled') {
      list = list.filter(
        (table) =>
          table.status === 'occupied' ||
          table.status === 'billing' ||
          table.status === 'merged',
      )
    }
    return list
  }, [floorTables, areaFilter, floorTab, floorQueryNorm])

  const diagramSections = useMemo(() => {
    if (areaFilter === 'all' && floorTab === 'all') {
      return areaSections
    }
    const byArea = new Map<string, typeof floorTables>()
    for (const table of visibleTables) {
      const list = byArea.get(table.area) ?? []
      list.push(table)
      byArea.set(table.area, list)
    }
    const names =
      areaFilter === 'all'
        ? tableAreas.filter((name) => byArea.has(name))
        : [areaFilter].filter((name) => byArea.has(name))
    return names.map((name) => ({ name, tables: byArea.get(name) ?? [] }))
  }, [areaFilter, floorTab, areaSections, visibleTables, tableAreas])

  const itemCountByTable = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [id, lines] of Object.entries(tableOrders)) {
      map[id] = lines.reduce((sum, line) => sum + line.qty, 0)
    }
    return map
  }, [tableOrders])

  function changeFloorView(next: 'list' | 'diagram') {
    setFloorView(next)
    try {
      sessionStorage.setItem(FLOOR_VIEW_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const freeTargets = floorTables.filter((t) => t.status === 'free' && t.id !== selectedId)

  function isEmptyOccupiedTable(table: (typeof tables)[number]) {
    if (table.status !== 'occupied' && table.status !== 'billing') return false
    if ((table.mergedFromLabels?.length ?? 0) > 0) return false
    const count = (tableOrders[table.id] ?? []).reduce((sum, line) => sum + line.qty, 0)
    return count === 0
  }

  function askClearEmpty(tableId: string, e?: { stopPropagation: () => void }) {
    e?.stopPropagation()
    setClearEmptyId(tableId)
  }

  function tableStatusLabel(status: string) {
    if (status === 'free') return t.tableFree
    if (status === 'occupied') return t.tableOccupied
    if (status === 'billing') return t.tableBilling
    if (status === 'reserved') return t.tableReserved
    if (status === 'merged') return t.tableMerged
    return status
  }

  function openMergedTarget(table: (typeof tables)[number]) {
    const targetId = table.mergedIntoId
    if (!targetId) return
    const target = tables.find((x) => x.id === targetId)
    flash(
      `Table ${table.label} is merged into Table ${table.mergedIntoLabel ?? target?.label ?? targetId} — opening target`,
    )
    setSelectedId(targetId)
    setTicketOpen(true)
  }

  function defaultOpenGuests(table: (typeof tables)[number], guests?: number) {
    return guests ?? (Math.min(2, table.seats) || 1)
  }

  function tableOpenedMessage(label: string, count?: number) {
    if (!seatAssignEnabled) return `Table ${label} opened`
    const guests = count ?? 1
    return `Table ${label} opened · ${guests} seat${guests === 1 ? '' : 's'}`
  }

  function openTableDirect(id: string, table: (typeof tables)[number], guests?: number) {
    const count = Math.min(Math.max(1, defaultOpenGuests(table, guests)), table.seats)
    openTable(id, count)
    setSelectedId(id)
    setTicketOpen(true)
    flash(tableOpenedMessage(table.label, count))
  }

  function onSelectTable(id: string) {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    if (table.status === 'merged') {
      openMergedTarget(table)
      return
    }
    if (table.status === 'free') {
      if (!seatAssignEnabled) {
        openTableDirect(id, table)
        return
      }
      setPendingOpenId(id)
      setGuestCount(Math.min(2, table.seats) || 1)
      setSelectedSeats([1])
      return
    }
    if (table.status === 'reserved') {
      if (!seatAssignEnabled) {
        openTableDirect(id, table, defaultOpenGuests(table, table.guests))
        return
      }
      setPendingOpenId(id)
      setGuestCount(table.guests ?? (Math.min(2, table.seats) || 1))
      setSelectedSeats(
        Array.from({ length: table.guests ?? 1 }, (_, i) => i + 1),
      )
      return
    }
    setSelectedId(id)
    setTicketOpen(true)
  }

  function toggleSeat(n: number) {
    setSelectedSeats((prev) => {
      const next = prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
      setGuestCount(Math.max(1, next.length))
      return next.length ? next : [n]
    })
  }

  function closeTicketPopup() {
    setTicketOpen(false)
  }

  function confirmOpenTable() {
    if (!pendingOpenId || !pendingOpen) return
    const guests = Math.min(
      Math.max(1, selectedSeats.length || guestCount),
      pendingOpen.seats,
    )
    openTable(pendingOpenId, guests)
    setSelectedId(pendingOpenId)
    setTicketOpen(true)
    setPendingOpenId(null)
    setSelectedSeats([])
    flash(tableOpenedMessage(pendingOpen.label, guests))
  }

  function buildBillPreview(kind: 'guest' | 'ebill', statusLabel: string): ReceiptData | null {
    if (!selected || lines.length === 0) return null
    const dineTicket = tickets.find(
      (t) => t.tableId === selected.id && t.checkStatus !== 'settled' && t.checkStatus !== 'merged',
    )
    const ids = buildReceiptIdentity({
      ticketId: dineTicket?.id,
      staff: user,
      tableLabel: selected.label,
    })
    return {
      title: `${t.printTable} ${selected.label} · ${localizedAreaName(selected.area, lang)}`,
      method: statusLabel,
      lines: lines.map((l) => ({ ...l })),
      subtotal: rawSubtotal,
      discountAmt: discountAmt || undefined,
      charges: chargeLines.length ? chargeLines.map((c) => ({ name: c.name, amount: c.amount })) : undefined,
      tax,
      total,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      tableLabel: ids.tableLabel,
      time: nowTime(),
      kind,
      orderType: 'dine-in',
      tableArea: selected.area,
    }
  }

  function saveBillOnly() {
    if (!selected || lines.length === 0) {
      flash('Add items before saving')
      return
    }
    flash(`Bill saved · Table ${selected.label}`)
  }

  function saveAndPrint() {
    if (!selected || lines.length === 0) {
      flash('Add items before print')
      return
    }
    const bill = buildBillPreview('guest', t.printGuestNotSettled)
    if (!bill) return
    setReceipt(bill)
    flash(t.diSavePrintFlash)
  }

  function saveAndBill() {
    if (!selected || lines.length === 0) {
      flash('Add items before billing')
      return
    }
    requestBill(selected.id)
    const bill = buildBillPreview('ebill', t.printSavedBill)
    if (bill) setReceipt(bill)
    flash(t.diSaveBillFlash.replace('{label}', selected.label))
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    const snapshot: OrderLine[] = lines.map((l) => ({ ...l }))
    const redeemSar = result.loyaltyRedeemSar ?? 0
    const voucherAmt = Math.max(0, result.foodVoucherAmount ?? 0)
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    if (result.giftCardId && (result.giftCardAmount ?? 0) > 0) {
      redeemGiftCard(result.giftCardId, result.giftCardAmount!)
    }
    if (result.foodVoucherId) {
      redeemFoodVoucher(result.foodVoucherId)
    }
    const taxOpts = orderTaxBillOptions(snapshot, dishes, taxes, company.enableTax !== false)
    const roundOff = Math.round((result.roundOff ?? 0) * 100) / 100
    const { bill: settledBill, payable, voucherSar } = settleAfterFoodVoucher({
      goods: rawSubtotal,
      discountPct,
      charges: chargeLines,
      taxOptions: taxOpts,
      baseBill: bill,
      foodVoucherSar: voucherAmt,
      loyaltySar: redeemSar,
      roundOff,
    })
    if (result.customerId) earnPoints(result.customerId, payable)
    const custName = customers.find((c) => c.id === result.customerId)?.name
    const paySplits = (result.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
    const dineTicket = tickets.find(
      (t) => t.tableId === selected.id && t.checkStatus !== 'settled' && t.checkStatus !== 'merged',
    )
    const ids = buildReceiptIdentity({
      ticketId: dineTicket?.id,
      staff: user,
      tableLabel: selected.label,
    })
    const receiptData: ReceiptData = {
      title: `${t.printTable} ${selected.label} · ${localizedAreaName(selected.area, lang)}`,
      method: result.method,
      lines: snapshot,
      subtotal: rawSubtotal,
      discountAmt: settledBill.discountAmt || undefined,
      discountPct: discountPct || undefined,
      charges: chargeLines.length ? chargeLines.map((c) => ({ name: c.name, amount: c.amount })) : undefined,
      tax: settledBill.tax,
      total: payable,
      loyaltyRedeem: redeemSar || undefined,
      foodVoucherAmt: voucherSar || undefined,
      foodVoucherCode: result.foodVoucherCode,
      splitParts: result.splitParts,
      splitPayments: paySplits.length ? paySplits : undefined,
      tendered: result.tendered,
      change: result.change,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      tableLabel: ids.tableLabel,
      time: nowTime(),
      customerName: custName,
      orderType: 'dine-in',
      tableArea: selected.area,
    }
    settleTable(selected.id, {
      method: result.method,
      source: `${t.printTable} ${selected.label}`,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      tableLabel: ids.tableLabel,
      subtotal: settledBill.taxable,
      tax: settledBill.tax,
      total: payable,
      discountAmt: settledBill.discountAmt || undefined,
      roundOff: roundOff || undefined,
      tendered: result.tendered,
      change: result.change,
      lines: snapshot,
      splitPayments: paySplits.length ? paySplits : undefined,
      customerId: result.customerId,
      loyaltyRedeem: redeemSar || undefined,
      charges: chargeLines.length ? chargeLines : undefined,
    })
    deductRecipeStock(snapshot, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, paySplits.length ? paySplits : undefined))
    setShowSettle(false)
    setTicketOpen(false)
    setSelectedId(null)
    setLinkedCustomerId(null)
    setReceipt(attachZatcaToReceipt({ ...receiptData, kind: 'paid' }))
    flash(`Paid by ${result.method}`)
  }

  function openCustomerSearch(source: 'floor' | 'ticket') {
    setCustomerPickSource(source)
    setShowCustomerPick(true)
  }

  return (
    <div className={`zk-dine${serverMode ? ' is-server-mode' : ''}`}>
      <DashHeader
        search={floorQuery}
        onSearchChange={setFloorQuery}
        brandTo="/"
        onSearchKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const hit = visibleTables[0] ?? areaSections.flatMap((s) => s.tables)[0]
          if (hit) onSelectTable(hit.id)
        }}
      />
    <div className="page-grid floor-only-layout dine-floor-page">
      {serverMode ? (
        <div className="dine-server-banner" role="status">
          <strong>{t.tileFoodServer}</strong>
          <span>{t.foodServerModeHint}</span>
          {user?.role !== 'food-server' ? (
            <Link to="/dine-in" className="dine-server-banner-link">
              {t.foodServerExitMode}
            </Link>
          ) : null}
        </div>
      ) : null}
      <section className="panel floor-panel dine-floor-panel">
        <div className="dine-floor-tabs" role="tablist">
          <button
            type="button"
            className={`dine-pill${floorTab === 'all' ? ' active' : ''}`}
            onClick={() => setFloorTab('all')}
          >
            {t.allTables}
          </button>
          <button
            type="button"
            className={`dine-pill${floorTab === 'unsettled' ? ' active' : ''}`}
            onClick={() => setFloorTab('unsettled')}
          >
            {t.tileUnsettled}
            <em>{floorStats.occupied + floorStats.billing + floorStats.merged}</em>
          </button>
          <button
            type="button"
            className={`dine-pill${floorTab === 'customers' ? ' active' : ''}`}
            onClick={() => {
              setFloorTab('customers')
              openCustomerSearch('floor')
            }}
          >
            {t.customerSearch}
          </button>
          <Link className="dine-pill dine-floor-tab-link" to="/delivery">
            {t.delivery}
          </Link>
          <div className="dine-floor-view-switch" role="group" aria-label="Floor view">
            <button
              type="button"
              className={`dine-pill${floorView === 'list' ? ' active' : ''}`}
              onClick={() => changeFloorView('list')}
            >
              {t.floorViewList}
            </button>
            <button
              type="button"
              className={`dine-pill${floorView === 'diagram' ? ' active' : ''}`}
              onClick={() => changeFloorView('diagram')}
            >
              {t.floorViewDiagram}
            </button>
          </div>
        </div>

        {dayIsClosed ? (
          <span className="chip">{t.dayClosedHint}</span>
        ) : null}

        <div className="dine-floor-shell">
          <div className="dine-floor-map">
            <div className="dine-stat-pills">
              <span className="dine-stat-pill free">
                <i />
                <strong>{floorStats.free}</strong> {t.tableFree}
              </span>
              <span className="dine-stat-pill occupied">
                <i />
                <strong>{floorStats.occupied}</strong> {t.tableOccupied}
              </span>
              <span className="dine-stat-pill billing">
                <i />
                <strong>{floorStats.billing}</strong> {t.tableBilling}
              </span>
              {floorStats.merged > 0 ? (
                <span className="dine-stat-pill merged">
                  <i />
                  <strong>{floorStats.merged}</strong> {t.tableMerged}
                </span>
              ) : null}
              <span className="dine-stat-pill covers">
                <strong>{floorStats.covers}</strong> {t.covers}
              </span>
            </div>

            {floorView === 'diagram' ? (
              <FloorDiagram
                sections={diagramSections}
                selectedId={selectedId}
                selectedOpen={ticketOpen}
                itemCountByTable={itemCountByTable}
                onSelectTable={onSelectTable}
                statusLabel={tableStatusLabel}
                emptyTitle={t.noTablesInView}
                emptyHint={t.switchAreaHint}
                branchId={activeBranchId}
              />
            ) : areaFilter === 'all' && floorTab === 'all' ? (
              areaSections.length === 0 ? (
                <div className="ticket-empty">
                  <strong>{t.noTablesInView}</strong>
                  {t.switchAreaHint}
                </div>
              ) : (
              <div className="floor-sections">
                {areaSections.map((section) => {
                  const free = section.tables.filter((t) => t.status === 'free').length
                  const busy = section.tables.length - free
                  return (
                    <div key={section.name} className="floor-section">
                      <div className="floor-section-head">
                        <h3>{localizedAreaName(section.name, lang)}</h3>
                        <span>
                          {section.tables.length} {t.tablesWord} · {free} {t.tableFree} · {busy} {t.inUse}
                        </span>
                      </div>
                      <div className="floor-grid floor-grid-wide dine-table-grid">
                        {section.tables.map((table) => {
                          const itemCount = (tableOrders[table.id] ?? []).reduce(
                            (sum, line) => sum + line.qty,
                            0,
                          )
                          return (
                            <DineTableTile
                              key={table.id}
                              table={table}
                              itemCount={itemCount}
                              selected={selectedId === table.id && ticketOpen}
                              canClearEmpty={isEmptyOccupiedTable(table) && perms.canOpenTable}
                              statusLabel={tableStatusLabel(table.status)}
                              onSelect={() => onSelectTable(table.id)}
                              onClearEmpty={(e) => askClearEmpty(table.id, e)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            ) : (
              <div className="floor-grid floor-grid-wide dine-table-grid">
                {visibleTables.length === 0 ? (
                  <div className="ticket-empty" style={{ gridColumn: '1 / -1' }}>
                    <strong>{t.noTablesInView}</strong>
                    {t.switchAreaHint}
                  </div>
                ) : (
                  visibleTables.map((table) => {
                    const itemCount = (tableOrders[table.id] ?? []).reduce(
                      (sum, line) => sum + line.qty,
                      0,
                    )
                    return (
                      <DineTableTile
                        key={table.id}
                        table={table}
                        itemCount={itemCount}
                        selected={selectedId === table.id && ticketOpen}
                        canClearEmpty={isEmptyOccupiedTable(table) && perms.canOpenTable}
                        statusLabel={tableStatusLabel(table.status)}
                        onSelect={() => onSelectTable(table.id)}
                        onClearEmpty={(e) => askClearEmpty(table.id, e)}
                      />
                    )
                  })
                )}
              </div>
            )}
          </div>

          <aside className="dine-area-side">
            <button
              type="button"
              className={`dine-area-pill${areaFilter === 'all' ? ' active' : ''}`}
              onClick={() => setAreaFilter('all')}
            >
              <strong>{t.allAreas}</strong>
              <span>{floorTables.length} {t.tablesWord}</span>
            </button>
            {tableAreas.map((area) => {
              const count = floorTables.filter((t) => t.area === area).length
              return (
                <button
                  key={area}
                  type="button"
                  className={`dine-area-pill${areaFilter === area ? ' active' : ''}`}
                  onClick={() => setAreaFilter(area)}
                >
                  <strong>{localizedAreaName(area, lang)}</strong>
                  <span>{count} {t.tablesWord}</span>
                </button>
              )
            })}
          </aside>
        </div>
      </section>

      {ticketVisible && selected ? (
        <div className="modal-backdrop ticket-backdrop" role="dialog" aria-modal="true">
          <div
            className={`modal-card ticket-popup dine-ticket-popup${orderSheetExpanded ? ' sheet-expanded' : ''}`}
          >
            <div className="ticket-popup-header dine-ticket-head">
              <div className="ticket-popup-title">
                <h2>Table T{selected.label}</h2>
                <span className="dine-head-chip area">{localizedAreaName(selected.area, lang)}</span>
                {linkedCustomerId ? (
                  <span className="dine-head-chip customer">
                    {customers.find((c) => c.id === linkedCustomerId)?.name ?? 'Customer'}
                  </span>
                ) : null}
                {seatAssignEnabled ? (
                  <div className="dine-head-guests">
                    <span>{t.guests}</span>
                    <div className="qty-controls">
                      <button type="button" onClick={() => setGuests(selected.id, (selected.guests ?? 1) - 1)} disabled={(selected.guests ?? 1) <= 1}>-</button>
                      <strong>{selected.guests ?? '—'}</strong>
                      <button type="button" onClick={() => setGuests(selected.id, Math.min(selected.seats, (selected.guests ?? 1) + 1))} disabled={(selected.guests ?? 0) >= selected.seats}>+</button>
                    </div>
                  </div>
                ) : null}
                <span className={`status-pill ${selected.status}`}>{tableStatusLabel(selected.status)}</span>
                {selected.mergedFromLabels?.length ? (
                  <span className="status-pill merged">
                    {t.tableMerged} +{selected.mergedFromLabels.length}
                  </span>
                ) : null}
              </div>
              <button type="button" className="dine-ticket-close" onClick={closeTicketPopup} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {selected.mergedFromLabels?.length ? (
              <div className="dine-merge-banner" role="status" title={t.diMergeBillHint}>
                <span className="dine-merge-badge">{t.tableMerged}</span>
                <strong className="dine-merge-banner-text">
                  {t.diMergeLinked
                    .replace('{count}', String(selected.mergedFromLabels.length))
                    .replace('{label}', selected.label)}
                </strong>
                <div className="dine-merge-chips">
                  <span className="dine-merge-chip host">
                    T{selected.label} · {t.diMergeHost}
                  </span>
                  {selected.mergedFromLabels.map((label, i) => (
                    <span key={`${label}-${i}`} className="dine-merge-chip">
                      T{label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dine-ticket-layout">
              <aside className="dine-ticket-actions">
                {perms.canChangeTable ? (
                  <button type="button" onClick={() => setShowTransfer(true)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M7 7h10M7 7l3-3M7 7l3 3M17 17H7M17 17l-3-3M17 17l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t.changeTable}
                  </button>
                ) : null}
                <button type="button" onClick={() => openCustomerSearch('ticket')}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  {t.diSelectCustomer}
                </button>
                {perms.canChangeTable ? (
                  <button type="button" onClick={() => setShowMerge(true)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3.5" y="6" width="7" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <rect x="13.5" y="6" width="7" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M10.5 12h3" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    {t.mergeTables}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowTicketNotePrompt(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 4h9l3 3v13H6V4Z" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  {t.diTicketNote}
                </button>
                {perms.canSendOrders ? (
                  <button
                    type="button"
                    className="accent"
                    onClick={() => {
                      if (pending === 0) {
                        flash(t.taNothingToSend)
                        return
                      }
                      setShowSend(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 12h11M15 12l-3-3M15 12l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 6h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H6" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    {t.sendOrders}
                    {pending > 0 ? ` (${pending})` : ''}
                  </button>
                ) : null}
                {perms.canTempBill || perms.canSettle ? (
                  <button type="button" disabled={lines.length === 0} onClick={saveAndBill}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M7 4h10v16H7V4Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M10 8h4M10 12h4M10 16h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {t.tempBill}
                  </button>
                ) : null}
                {perms.canOpenTable && isEmptyOccupiedTable(selected) ? (
                  <button
                    type="button"
                    className="dine-ticket-clear-empty"
                    onClick={() => askClearEmpty(selected.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 7h12M9 7V5h6v2M10 11v6M14 11v6M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t.diClearTable}
                  </button>
                ) : null}
                {perms.canSettle ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={lines.length === 0}
                    onClick={() => {
                      setSettlePreset(null)
                      setShowSettle(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    {t.settle}
                  </button>
                ) : null}
              </aside>

              <div className="ticket-popup-body">
              {/* LEFT: menu picker */}
              <div className="ticket-popup-menu">
                <MenuPicker onAdd={handleMenuAdd} />
              </div>

              {/* RIGHT: order + totals + actions */}
              <div className={`ticket-popup-order${orderSheetExpanded ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className="dine-order-sheet-handle"
                  aria-label={orderSheetExpanded ? t.collapse : t.expand}
                  onClick={() => setOrderSheetExpanded((v) => !v)}
                />
                <div className="dine-order-sheet-head">
                  <strong>{t.diOrderItems}</strong>
                  <button
                    type="button"
                    className="dine-order-clear"
                    disabled={lines.length === 0}
                    onClick={() => {
                      if (!selected || lines.length === 0) return
                      const snapshot = [...lines]
                      setClearAllPending(snapshot)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M6 8h12M9.5 8V6.5A1.5 1.5 0 0 1 11 5h2a1.5 1.5 0 0 1 1.5 1.5V8M9 11v6M12 11v6M15 11v6M8 8l.6 11.2A1.5 1.5 0 0 0 10.1 21h3.8a1.5 1.5 0 0 0 1.5-1.4L16 8"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {t.diClearAll}
                  </button>
                </div>
                <div className="dine-order-sheet-body">
                {ticketNote ? <p className="dine-ticket-note">{t.taNoteLabel}: {ticketNote}</p> : null}
                <div className="dine-order-panel">
                  {lines.length === 0 ? (
                    <div className="dine-order-cards">
                      <div className="ticket-empty">
                        <strong>{t.taNoItems}</strong>
                        {t.diNoItemsHint}
                      </div>
                    </div>
                  ) : (
                    <div className="dine-order-cards">
                      {lines.map((line) => {
                        const noteText = line.note?.trim() ?? ''
                        const itemName = localizedLineName(line, dishes, lang)
                        const dish = dishes.find((d) => d.id === line.itemId)
                        const opts = parseOrderLineNote(line.note, dish)
                        const hasOptBadges = Boolean(opts.size || opts.addons.length)
                        const displayName = hasOptBadges
                          ? lineNameWithoutOptions(itemName, line.note)
                          : itemName
                        const thumb = dish?.imageDataUrl
                        const thumbMark =
                          dish?.code?.trim() ||
                          (line.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || '•').toUpperCase()
                        const taxPct = dishTaxPercent(dish?.taxIds, taxes)
                        const lineGoods = Math.round(line.qty * line.price * 100) / 100
                        const lineShare = rawSubtotal > 0 ? lineGoods / rawSubtotal : 0
                        const lineNet = lineGoods - discountAmt * lineShare
                        const lineTax =
                          company.enableTax === false
                            ? 0
                            : Math.round(lineNet * (taxPct / 100) * 100) / 100
                        const hasItemTax = Boolean(normalizeTaxIds(dish?.taxIds)[0])
                        const taxRateName = (() => {
                          const id = normalizeTaxIds(dish?.taxIds)[0]
                          if (!id) return null
                          return taxes.find((t) => t.id === id)?.name ?? null
                        })()
                        return (
                          <article key={line.id} className="dine-order-item">
                            <div className="dine-order-item-top">
                              <span
                                className={`dine-order-item-thumb${thumb ? ' has-photo' : ''}`}
                                aria-hidden
                              >
                                {thumb ? <img src={thumb} alt="" /> : thumbMark}
                              </span>
                              <div className="dine-order-item-info">
                                <strong className="dine-order-item-name">{displayName}</strong>
                                {hasOptBadges ? (
                                  <div className="dine-order-item-opts" aria-label="Options">
                                    {opts.size ? (
                                      <span className="dine-opt-badge size">{opts.size}</span>
                                    ) : null}
                                    {opts.addons.map((addon) => (
                                      <span key={addon} className="dine-opt-badge addon">
                                        {addon}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <span className="dine-order-item-price mesa-ltr-nums">
                                  {money(line.price)}
                                </span>
                                {company.enableTax !== false ? (
                                  <span
                                    className={`dine-order-item-tax${!hasItemTax ? ' is-default' : ''}`}
                                    title={
                                      hasItemTax
                                        ? `Item tax${taxRateName ? `: ${taxRateName}` : ''}`
                                        : 'Company default tax'
                                    }
                                  >
                                    Tax {Number.isInteger(taxPct) ? taxPct : taxPct.toFixed(2)}%
                                    {hasItemTax ? '' : ' · default'}
                                    <em className="mesa-ltr-nums"> · {money(lineTax)}</em>
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="dine-order-item-mid">
                              <QtyStepper
                                className="dine-qty"
                                value={line.qty}
                                ariaLabel={displayName}
                                minusDisabled={!!line.sent}
                                inputDisabled={!!line.sent}
                                onChange={(delta) => changeTableQty(selected.id, line.id, delta)}
                              />
                              <strong className="dine-order-item-total mesa-ltr-nums">
                                {money(line.qty * line.price)}
                              </strong>
                              <button
                                type="button"
                                className="dine-void-btn"
                                title={t.diVoidLine}
                                onClick={() =>
                                  setVoidTarget({
                                    tableId: selected.id,
                                    lineId: line.id,
                                    name: line.name,
                                  })
                                }
                              >
                                {t.diVoid}
                              </button>
                            </div>

                            <div className="dine-order-item-meta">
                              <span className={`dine-order-item-status${line.sent ? ' sent' : ''}`}>
                                {line.sent ? t.taStatusSent : t.diNotSent}
                              </span>
                              <button
                                type="button"
                                className="dine-line-note-btn"
                                title={noteText ? t.diUpdateNote : t.diAddNote}
                                onClick={() =>
                                  setNoteTarget({
                                    tableId: selected.id,
                                    lineId: line.id,
                                    name: displayName,
                                    note: line.note ?? '',
                                  })
                                }
                              >
                                {noteText ? t.diEditNote : t.diAddNote}
                              </button>
                            </div>

                            {opts.kitchenNote ? (
                              <p className="dine-order-item-note">{opts.kitchenNote}</p>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="ticket-footer">
                  <div className="totals">
                    <div>
                      <span>{t.subtotal}</span>
                      <span>{money(rawSubtotal)}</span>
                    </div>
                    <div>
                      <span>
                        {t.discount} ({discountPct}%)
                      </span>
                      <span>-{money(discountAmt)}</span>
                    </div>
                    {chargeLines.map((c) => (
                      <div key={c.id}>
                        <span>{c.name}</span>
                        <span>{money(c.amount)}</span>
                      </div>
                    ))}
                    {vatDetailRows.length > 0
                      ? vatDetailRows.map((row) => (
                          <div
                            key={`vat-${row.percent}`}
                            className="totals-vat-row"
                            title={
                              row.items.length
                                ? row.items.map((n) => `${n} · ${vatRateLabel(row.percent)}`).join('\n')
                                : vatRateLabel(row.percent)
                            }
                          >
                            <span>{vatRateLabel(row.percent)}</span>
                            <span>{money(row.tax)}</span>
                          </div>
                        ))
                      : (
                          <div
                            key="vat-fallback"
                            className="totals-vat-row"
                            hidden={!(tax > 0)}
                          >
                            <span>{vatLabel}</span>
                            <span>{money(tax)}</span>
                          </div>
                        )}
                    <div className="grand">
                      <span>{t.total}</span>
                      <span>{money(total)}</span>
                    </div>
                  </div>
                  <div className="discount-row">
                    <span className="field-label">{t.discount}</span>
                    <div className="menu-tabs">
                      {discountPicks.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          className={discountPct === pct ? 'active' : ''}
                          onClick={() => selected && setTableDiscount(selected.id, pct)}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  {chargeCatalog.some((c) => c.active) ? (
                  <div className="discount-row">
                    <span className="field-label">{t.diExtraCharges}</span>
                    <div className="menu-tabs">
                      {chargeCatalog
                        .filter((c) => c.active)
                        .map((c) => {
                          const on = (tableCharges[selected.id] ?? []).includes(c.id)
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={on ? 'active' : ''}
                              onClick={() => toggleTableCharge(selected.id, c.id)}
                            >
                              {c.name}
                              {' · '}
                              {c.percent ? `${c.amount}%` : money(c.amount)}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                  ) : null}
                  <div className="action-row action-row-3">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={lines.length === 0}
                      onClick={saveBillOnly}
                    >
                      {t.diSave}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={lines.length === 0}
                      onClick={saveAndPrint}
                    >
                      {t.diSavePrint}
                    </button>
                    {perms.canTempBill || perms.canSettle ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={lines.length === 0}
                        onClick={saveAndBill}
                      >
                        {t.diSaveBill}
                      </button>
                    ) : null}
                    {perms.canSendOrders ? (
                      <button
                        type="button"
                        className="btn btn-teal"
                        onClick={() => {
                          if (pending === 0) {
                            flash(t.taNothingToSend)
                            return
                          }
                          setShowSend(true)
                        }}
                      >
                        {t.diKot}
                        {pending > 0 ? ` (${pending})` : ''}
                      </button>
                    ) : null}
                    {perms.canSendOrders ? (
                      <button
                        type="button"
                        className="btn btn-teal"
                        onClick={() => {
                          if (!selected) return
                          if (pending > 0) {
                            sendTableOrders(selected.id, 'normal')
                            flash(
                              t.diKotSentFlash.replace('{count}', String(pending)),
                            )
                          }
                          const bill = buildBillPreview('guest', t.printKotAndPrint)
                          if (bill) setReceipt(bill)
                          else if (pending === 0) flash(t.diNothingToPrint)
                        }}
                      >
                        {t.diKotPrint}
                      </button>
                    ) : null}
                    {perms.canSettle ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={lines.length === 0}
                        onClick={() => {
                          setSettlePreset('Split bill')
                          setShowSettle(true)
                        }}
                      >
                        {t.diSplit}
                      </button>
                    ) : null}
                    {perms.canChangeTable ? (
                      <button type="button" className="btn btn-ghost" onClick={() => setShowTransfer(true)}>
                        {t.changeTable}
                      </button>
                    ) : null}
                    {perms.canChangeTable ? (
                      <button type="button" className="btn btn-ghost" onClick={() => setShowMerge(true)}>
                        {t.mergeTables}
                      </button>
                    ) : null}
                    {perms.canSettle ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={lines.length === 0}
                        onClick={() => {
                          setSettlePreset(null)
                          setShowSettle(true)
                        }}
                      >
                        {t.settle}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={lines.length === 0}
                        onClick={() => {
                          requestBill(selected.id)
                          flash('Payment requested — cashier will settle')
                          closeTicketPopup()
                        }}
                      >
                        {t.requestPayment}
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingOpen && seatAssignEnabled ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dine-seat-card">
            <div className="section-head">
              <h2>Table seat · T{pendingOpen.label}-{pendingOpen.seats}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setPendingOpenId(null)}>
                ✕
              </button>
            </div>
            <p className="modal-lead">
              {t.diAssignSeats
                .replace('{area}', localizedAreaName(pendingOpen.area, lang))
                .replace('{count}', String(selectedSeats.length))}
            </p>
            <div className="dine-seat-row">
              {Array.from({ length: pendingOpen.seats }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`dine-seat-btn${selectedSeats.includes(n) ? ' on' : ''}`}
                  onClick={() => toggleSeat(n)}
                >
                  <span className="dine-seat-icon" aria-hidden />
                  <strong>{n}</strong>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={confirmOpenTable}>
              Open with {Math.max(1, selectedSeats.length)} guest
              {selectedSeats.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      ) : null}

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTableOrders(selected.id, priority)
            setShowSend(false)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={`Table ${selected.label}`}
          total={total}
          customers={customers}
          initialMethod={settlePreset === 'Split bill' ? null : settlePreset}
          startInSplit={settlePreset === 'Split bill'}
          preselectCustomerId={linkedCustomerId ?? undefined}
          computeDue={(voucherSar, loyaltySar) => {
            const next = calcBillWithFoodVoucher(
              rawSubtotal,
              discountPct,
              chargeLines,
              orderTaxBillOptions(lines, dishes, taxes, company.enableTax !== false),
              voucherSar,
            )
            return Math.max(0, Math.round((next.total - loyaltySar) * 100) / 100)
          }}
          onClose={() => {
            setShowSettle(false)
            setSettlePreset(null)
          }}
          onConfirm={completeSettle}
        />
      ) : null}

      {voidTarget ? (
        <TextPromptModal
          title={t.diVoidTitle.replace('{name}', voidTarget.name)}
          label={t.diVoidReason}
          initialValue={t.diVoidDefault}
          placeholder={t.diReason}
          confirmLabel={t.diVoidItem}
          cancelLabel={t.cancel}
          onClose={() => setVoidTarget(null)}
          onConfirm={(reason) => {
            const target = voidTarget
            setVoidTarget(null)
            voidTableLine(target.tableId, target.lineId, reason || t.diVoidDefault, user?.name)
          }}
        />
      ) : null}

      {clearAllPending && selected ? (
        <ConfirmModal
          title={t.diClearAllTitle}
          message={t.diClearAllMsg.replace('{count}', String(clearAllPending.length))}
          confirmLabel={t.diClearAll}
          cancelLabel={t.cancel}
          danger
          onClose={() => setClearAllPending(null)}
          onConfirm={() => {
            const tableId = selected.id
            const snapshot = clearAllPending
            setClearAllPending(null)
            for (const line of snapshot) {
              voidTableLine(tableId, line.id, t.diClearAll, user?.name)
            }
            flash(t.diOrderCleared)
          }}
        />
      ) : null}

      {clearEmptyId ? (
        <ConfirmModal
          title={t.diClearEmptyTitle}
          message={t.diClearEmptyMsg.replace(
            '{label}',
            tables.find((x) => x.id === clearEmptyId)?.label ?? clearEmptyId,
          )}
          confirmLabel={t.diRemove}
          cancelLabel={t.cancel}
          danger
          onClose={() => setClearEmptyId(null)}
          onConfirm={() => {
            const id = clearEmptyId
            setClearEmptyId(null)
            clearEmptyTable(id)
            if (selectedId === id) {
              setTicketOpen(false)
              setSelectedId(null)
            }
          }}
        />
      ) : null}

      {noteTarget ? (
        <TextPromptModal
          title={t.diNoteTitle.replace('{name}', noteTarget.name)}
          label={t.diItemNote}
          initialValue={noteTarget.note}
          placeholder={t.diNotePlaceholder}
          confirmLabel={t.diSaveNote}
          cancelLabel={t.cancel}
          suggestions={ITEM_NOTE_SUGGESTIONS}
          onClose={() => setNoteTarget(null)}
          onConfirm={(note) => {
            const target = noteTarget
            setNoteTarget(null)
            setTableLineNote(target.tableId, target.lineId, note)
            flash(note ? t.diNoteSaved : t.diNoteCleared)
          }}
        />
      ) : null}

      {showTicketNotePrompt ? (
        <TextPromptModal
          title={t.diTicketNote}
          label="Note for this table"
          initialValue={ticketNote}
          placeholder="Optional note"
          confirmLabel="Save"
          onClose={() => setShowTicketNotePrompt(false)}
          onConfirm={(note) => {
            const cleaned = note.trim()
            setShowTicketNotePrompt(false)
            setTicketNote(cleaned)
            if (selected) setTableTicketNote(selected.id, cleaned)
            flash(cleaned ? t.diTicketNoteSaved : t.diNoteCleared)
          }}
        />
      ) : null}

      {showCustomerPick ? (
        <CustomerSearchPanel
          selectedId={linkedCustomerId}
          onClose={() => {
            setShowCustomerPick(false)
            if (customerPickSource === 'floor') setFloorTab('all')
          }}
          onSelect={(c) => {
            setLinkedCustomerId(c?.id ?? null)
            setShowCustomerPick(false)
            if (customerPickSource === 'floor') setFloorTab('all')
            if (c) {
              flash(
                customerPickSource === 'ticket' || ticketVisible
                  ? `Customer · ${c.name}`
                  : `Customer ready · ${c.name} · open a table to link`,
              )
            } else {
              flash('Walk-in')
            }
          }}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}

      {showTransfer && selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dine-pick-modal">
            <div className="dine-pick-head">
              <div>
                <h2>{t.changeTable}</h2>
                <p className="modal-lead">
                  Move open ticket from <strong>T{selected.label}</strong> to a free table.
                </p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setShowTransfer(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {freeTargets.length === 0 ? (
              <p className="modal-lead">No free tables available.</p>
            ) : (
              <div className="dine-pick-grid">
                {freeTargets.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className="dine-pick-tile free"
                    onClick={() => {
                      transferTable(selected.id, table.id)
                      setSelectedId(table.id)
                      setShowTransfer(false)
                    }}
                  >
                    <span className="dine-pick-visual" aria-hidden>
                      <TableIcon seats={table.seats} />
                    </span>
                    <strong>T{table.label}-{table.seats}</strong>
                    <span className="dine-head-chip area">{localizedAreaName(table.area, lang)}</span>
                    <span className="status-pill free">{t.tableFree}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showMerge && selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dine-pick-modal">
            <div className="dine-pick-head">
              <div>
                <h2>{t.mergeTables}</h2>
                <p className="modal-lead">
                  {t.diMergeInto} <strong>T{selected.label}</strong>
                  {selected.area ? (
                    <>
                      {' '}
                      · {t.diGroupedByArea} · <strong>{localizedAreaName(selected.area, lang)}</strong>{' '}
                      {t.diAreaFirst}
                    </>
                  ) : null}
                  . Occupied tables combine the bill; free tables link as MERGED seating.
                </p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setShowMerge(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {mergeTargets.length === 0 ? (
              <p className="modal-lead">No other tables available to merge.</p>
            ) : (
              <div className="dine-pick-areas">
                {mergeTargetsByArea.map((section) => (
                  <section key={section.name} className="dine-pick-area">
                    <div className="dine-pick-area-head">
                      <h3>{localizedAreaName(section.name, lang)}</h3>
                      <span>
                        {section.tables.length}
                        {section.sameArea ? ' · same area' : ''}
                        {' · '}
                        {section.tables.filter((t) => t.status === 'free' || t.status === 'reserved').length}{' '}
                        free
                        {' · '}
                        {
                          section.tables.filter(
                            (t) => t.status === 'occupied' || t.status === 'billing',
                          ).length
                        }{' '}
                        open
                      </span>
                    </div>
                    <div className="dine-pick-grid">
                      {section.tables.map((table) => {
                        const isFree = table.status === 'free' || table.status === 'reserved'
                        return (
                          <button
                            key={table.id}
                            type="button"
                            className={`dine-pick-tile ${table.status}`}
                            onClick={() => {
                              mergeTables(selected.id, table.id)
                              setShowMerge(false)
                            }}
                          >
                            <span className="dine-pick-visual" aria-hidden>
                              <TableIcon seats={table.seats} busy={!isFree} />
                            </span>
                            <strong>
                              T{table.label}-{table.seats}
                            </strong>
                            <span className={`status-pill ${table.status}`}>
                              {tableStatusLabel(table.status)}
                            </span>
                            <span className="dine-pick-amt">
                              {isFree ? 'Link seating' : money(table.amount ?? 0)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
      <HubFooter backTo="/" backLabel={t.home} />
    </div>
  )
}
