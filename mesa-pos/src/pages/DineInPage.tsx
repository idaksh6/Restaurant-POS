import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import MenuPicker from '../components/MenuPicker'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { orderedAreaNames } from '../data/tableAreas'
import { lineTotal, money, nowTime, type OrderLine } from '../data/mock'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { localizedLineName } from '../lib/branding'
import { floorDiscountPercents } from '../data/discount'
import { assignGuestsOnOpen, POS_PREFS_EVENT } from '../data/posPrefs'
import { SAUDI } from '../locale/saudi'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import TableIcon from '../components/TableIcon'

export default function DineInPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, discounts } = useCatalog()
  const discountPicks = useMemo(() => floorDiscountPercents(discounts), [discounts])
  const { addCashIn } = useShift()
  const {
    tables,
    tableOrders,
    openTable,
    setGuests,
    selectAddToTable,
    changeTableQty,
    voidTableLine,
    sendTableOrders,
    transferTable,
    mergeTables,
    tableDiscounts,
    setTableDiscount,
    chargeCatalog,
    tableCharges,
    toggleTableCharge,
    getTableChargeLines,
    requestBill,
    settleTable,
    deductRecipeStock,
    dayIsClosed,
    flash,
  } = usePos()

  const tableAreas = useMemo(
    () => orderedAreaNames(tables.map((table) => table.area).filter(Boolean)),
    [tables],
  )

  const perms = user ? getPermissions(user.role) : getPermissions('food-server')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [settlePreset, setSettlePreset] = useState<'Cash' | 'mada' | 'Split bill' | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [floorTab, setFloorTab] = useState<'all' | 'unsettled' | 'customers'>('all')
  const [areaFilter, setAreaFilter] = useState<string | 'all'>('all')
  const [floorQuery, setFloorQuery] = useState('')
  const [ticketNote, setTicketNote] = useState('')
  const [showCustomerPick, setShowCustomerPick] = useState(false)
  const [customerPickSource, setCustomerPickSource] = useState<'floor' | 'ticket'>('ticket')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<{ tableId: string; lineId: string; name: string } | null>(
    null,
  )
  const [showTicketNotePrompt, setShowTicketNotePrompt] = useState(false)
  const [seatAssignEnabled, setSeatAssignEnabled] = useState(() => assignGuestsOnOpen())

  useEffect(() => {
    const sync = () => setSeatAssignEnabled(assignGuestsOnOpen())
    window.addEventListener(POS_PREFS_EVENT, sync)
    return () => window.removeEventListener(POS_PREFS_EVENT, sync)
  }, [])

  const selected = selectedId ? tables.find((t) => t.id === selectedId) : undefined
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
  const bill = calcBill(rawSubtotal, discountPct, chargeLines)
  const { discountAmt, tax, total } = bill

  const mergeTargets = tables.filter(
    (t) =>
      t.id !== selectedId &&
      (t.status === 'occupied' || t.status === 'billing') &&
      (tableOrders[t.id] ?? []).length > 0,
  )

  const floorStats = useMemo(() => {
    const free = tables.filter((t) => t.status === 'free').length
    const occupied = tables.filter((t) => t.status === 'occupied').length
    const billing = tables.filter((t) => t.status === 'billing').length
    const covers = tables.reduce((sum, t) => sum + (t.status === 'free' ? 0 : t.guests ?? 0), 0)
    return { free, occupied, billing, covers }
  }, [tables])

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
          tables: tables.filter((table) => table.area === name && tableMatchesQuery(table)),
        }))
        .filter((section) => section.tables.length > 0),
    [tables, floorQueryNorm],
  )

  const visibleTables = useMemo(() => {
    let list = tables.filter(tableMatchesQuery)
    if (areaFilter !== 'all') list = list.filter((table) => table.area === areaFilter)
    if (floorTab === 'unsettled') {
      list = list.filter((table) => table.status === 'occupied' || table.status === 'billing')
    }
    return list
  }, [tables, areaFilter, floorTab, floorQueryNorm])

  const freeTargets = tables.filter((t) => t.status === 'free' && t.id !== selectedId)

  function tableStatusLabel(status: string) {
    if (status === 'free') return t.tableFree
    if (status === 'occupied') return t.tableOccupied
    if (status === 'billing') return t.tableBilling
    if (status === 'reserved') return t.tableReserved
    return status
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
    return {
      title: `${t.printTable} ${selected.label} · ${selected.area}`,
      method: statusLabel,
      lines: lines.map((l) => ({ ...l })),
      subtotal: rawSubtotal,
      discountAmt: discountAmt || undefined,
      charges: chargeLines.length ? chargeLines.map((c) => ({ name: c.name, amount: c.amount })) : undefined,
      tax,
      total,
      staff: user?.name,
      time: nowTime(),
      kind,
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
    flash('Save & Print · guest bill ready')
  }

  function saveAndBill() {
    if (!selected || lines.length === 0) {
      flash('Add items before billing')
      return
    }
    requestBill(selected.id)
    const bill = buildBillPreview('ebill', t.printSavedBill)
    if (bill) setReceipt(bill)
    flash(`Save & Bill · Table ${selected.label} marked billing`)
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    const snapshot: OrderLine[] = lines.map((l) => ({ ...l }))
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    if (result.giftCardId && (result.giftCardAmount ?? 0) > 0) {
      redeemGiftCard(result.giftCardId, result.giftCardAmount!)
    }
    if (result.foodVoucherId) {
      redeemFoodVoucher(result.foodVoucherId)
    }
    const payable = Math.max(0, Math.round((total - redeemSar) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    const custName = customers.find((c) => c.id === result.customerId)?.name
    const receiptData: ReceiptData = {
      title: `${t.printTable} ${selected.label} · ${selected.area}`,
      method: result.method,
      lines: snapshot,
      subtotal: rawSubtotal,
      discountAmt: discountAmt || undefined,
      charges: chargeLines.length ? chargeLines.map((c) => ({ name: c.name, amount: c.amount })) : undefined,
      tax,
      total: payable,
      loyaltyRedeem: redeemSar || undefined,
      splitParts: result.splitParts,
      splitPayments: result.splitPayments,
      tendered: result.tendered,
      change: result.change,
      staff: user?.name,
      time: nowTime(),
      customerName: custName,
    }
    settleTable(selected.id, {
      method: result.method,
      source: `${t.printTable} ${selected.label}`,
      staff: user?.name,
      subtotal: bill.taxable,
      tax,
      total: payable,
      discountAmt: discountAmt || undefined,
      lines: snapshot,
      splitPayments: result.splitPayments,
      customerId: result.customerId,
      loyaltyRedeem: redeemSar || undefined,
      charges: chargeLines.length ? chargeLines : undefined,
    })
    deductRecipeStock(snapshot, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
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
    <div className="zk-dine">
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
            <em>{floorStats.occupied + floorStats.billing}</em>
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
              <span className="dine-stat-pill covers">
                <strong>{floorStats.covers}</strong> {t.covers}
              </span>
            </div>

            {areaFilter === 'all' && floorTab === 'all' ? (
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
                        <h3>{section.name}</h3>
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
                          const isActive = table.status !== 'free'
                          return (
                            <button
                              key={table.id}
                              type="button"
                              className={`table-tile dine-table-tile ${table.status}${selectedId === table.id && ticketOpen ? ' selected' : ''}`}
                              onClick={() => onSelectTable(table.id)}
                            >
                              <span className="dine-table-visual" aria-hidden>
                                <TableIcon seats={table.seats} busy={isActive} />
                              </span>
                              <strong className="dine-table-code">T{table.label}-{table.seats}</strong>
                              <span className={`status-pill ${table.status}`}>{tableStatusLabel(table.status)}</span>
                              <div className="table-foot">
                                {isActive ? (
                                  <>
                                    <span className="item-count">
                                      {itemCount} {itemCount === 1 ? t.itemOne : t.itemMany}
                                    </span>
                                    <span className="amount">
                                      {typeof table.amount === 'number' ? money(table.amount) : money(0)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="item-count muted">{t.tapToSeat}</span>
                                )}
                              </div>
                            </button>
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
                    const isActive = table.status !== 'free'
                    return (
                      <button
                        key={table.id}
                        type="button"
                        className={`table-tile dine-table-tile ${table.status}${selectedId === table.id && ticketOpen ? ' selected' : ''}`}
                        onClick={() => onSelectTable(table.id)}
                      >
                        <span className="dine-table-visual" aria-hidden>
                          <TableIcon seats={table.seats} busy={isActive} />
                        </span>
                        <strong className="dine-table-code">T{table.label}-{table.seats}</strong>
                        <span className={`status-pill ${table.status}`}>{tableStatusLabel(table.status)}</span>
                        <small className="dine-table-area">{table.area}</small>
                        <div className="table-foot">
                          {isActive ? (
                            <>
                              <span className="item-count">
                                {itemCount} {itemCount === 1 ? t.itemOne : t.itemMany}
                              </span>
                              <span className="amount">
                                {typeof table.amount === 'number' ? money(table.amount) : money(0)}
                              </span>
                            </>
                          ) : (
                            <span className="item-count muted">{t.tapToSeat}</span>
                          )}
                        </div>
                      </button>
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
              <span>{tables.length} {t.tablesWord}</span>
            </button>
            {tableAreas.map((area) => {
              const count = tables.filter((t) => t.area === area).length
              return (
                <button
                  key={area}
                  type="button"
                  className={`dine-area-pill${areaFilter === area ? ' active' : ''}`}
                  onClick={() => setAreaFilter(area)}
                >
                  <strong>{area}</strong>
                  <span>{count} {t.tablesWord}</span>
                </button>
              )
            })}
          </aside>
        </div>
      </section>

      {ticketVisible && selected ? (
        <div className="modal-backdrop ticket-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card ticket-popup dine-ticket-popup">
            <div className="ticket-popup-header dine-ticket-head">
              <div className="ticket-popup-title">
                <h2>Table T{selected.label}</h2>
                <span className="dine-head-chip area">{selected.area}</span>
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
              </div>
              <button type="button" className="dine-ticket-close" onClick={closeTicketPopup} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="dine-ticket-layout">
              <aside className="dine-ticket-actions">
                {perms.canChangeTable ? (
                  <button type="button" onClick={() => setShowTransfer(true)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M7 7h10M7 7l3-3M7 7l3 3M17 17H7M17 17l-3-3M17 17l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Change table
                  </button>
                ) : null}
                <button type="button" onClick={() => openCustomerSearch('ticket')}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Select customer
                </button>
                {perms.canChangeTable ? (
                  <button type="button" onClick={() => setShowMerge(true)}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3.5" y="6" width="7" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <rect x="13.5" y="6" width="7" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M10.5 12h3" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    Merge
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
                  Ticket note
                </button>
                {perms.canSendOrders ? (
                  <button
                    type="button"
                    className="accent"
                    onClick={() => {
                      if (pending === 0) {
                        flash('Nothing new to send')
                        return
                      }
                      setShowSend(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 12h11M15 12l-3-3M15 12l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 6h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H6" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    Send orders{pending > 0 ? ` (${pending})` : ''}
                  </button>
                ) : null}
                {perms.canTempBill || perms.canSettle ? (
                  <button type="button" disabled={lines.length === 0} onClick={saveAndBill}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M7 4h10v16H7V4Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M10 8h4M10 12h4M10 16h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Temporary bill
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
                    Settle
                  </button>
                ) : null}
              </aside>

              <div className="ticket-popup-body">
              {/* LEFT: menu picker */}
              <div className="ticket-popup-menu">
                <MenuPicker onAdd={(item, note) => selectAddToTable(selected.id, item, note)} />
              </div>

              {/* RIGHT: order + totals + actions */}
              <div className="ticket-popup-order">
                {ticketNote ? <p className="dine-ticket-note">Note: {ticketNote}</p> : null}
                <div className="dine-order-panel">
                  {lines.length === 0 ? (
                    <div className="order-list">
                      <div className="ticket-empty">
                        <strong>No items yet</strong>
                        Add dishes, then use Send KOT.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="dine-order-head" role="row">
                        <span>Item</span>
                        <span className="num">Qty</span>
                        <span className="num">Total</span>
                        <span className="void-col" aria-hidden />
                      </div>
                      <div className="order-list">
                        <table className="dine-order-table">
                          <tbody>
                            {lines.map((line) => (
                              <tr key={line.id}>
                                <td>
                                  <strong>{localizedLineName(line, dishes, lang)}</strong>
                                  <small>
                                    {money(line.price)} · {line.sent ? 'Sent' : 'Not sent'}
                                    {line.note ? ` · ${line.note}` : ''}
                                  </small>
                                </td>
                                <td className="num">
                                  <div className="qty-controls">
                                    <button type="button" onClick={() => changeTableQty(selected.id, line.id, -1)}>-</button>
                                    <span>{line.qty}</span>
                                    <button type="button" onClick={() => changeTableQty(selected.id, line.id, 1)}>+</button>
                                  </div>
                                </td>
                                <td className="num amt">{money(line.qty * line.price)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="dine-void-btn"
                                    title="Void line"
                                    onClick={() =>
                                      setVoidTarget({
                                        tableId: selected.id,
                                        lineId: line.id,
                                        name: line.name,
                                      })
                                    }
                                  >
                                    Void
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
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
                    <div>
                      <span>{SAUDI.vatLabel}</span>
                      <span>{money(tax)}</span>
                    </div>
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
                  <div className="discount-row">
                    <span className="field-label">Extra charges</span>
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
                              {c.percent ? ` ${c.amount}%` : ''}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                  <div className="action-row action-row-3">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={lines.length === 0}
                      onClick={saveBillOnly}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={lines.length === 0}
                      onClick={saveAndPrint}
                    >
                      Save &amp; Print
                    </button>
                    {perms.canTempBill || perms.canSettle ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={lines.length === 0}
                        onClick={saveAndBill}
                      >
                        Save &amp; Bill
                      </button>
                    ) : null}
                    {perms.canSendOrders ? (
                      <button
                        type="button"
                        className="btn btn-teal"
                        onClick={() => {
                          if (pending === 0) {
                            flash('Nothing new to send')
                            return
                          }
                          setShowSend(true)
                        }}
                      >
                        KOT
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
                            flash(`KOT sent · ${pending} item(s)`)
                          }
                          const bill = buildBillPreview('guest', t.printKotAndPrint)
                          if (bill) setReceipt(bill)
                          else if (pending === 0) flash('Nothing to print')
                        }}
                      >
                        KOT &amp; Print
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
                        Split
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
              {pendingOpen.area} · tap seats to assign guests ({selectedSeats.length} selected)
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
          onClose={() => {
            setShowSettle(false)
            setSettlePreset(null)
          }}
          onConfirm={completeSettle}
        />
      ) : null}

      {voidTarget ? (
        <TextPromptModal
          title={`Void ${voidTarget.name}`}
          label="Void reason (optional)"
          initialValue="Void"
          placeholder="Reason"
          confirmLabel="Void item"
          cancelLabel="Cancel"
          onClose={() => setVoidTarget(null)}
          onConfirm={(reason) => {
            const target = voidTarget
            setVoidTarget(null)
            voidTableLine(target.tableId, target.lineId, reason || 'Void', user?.name)
          }}
        />
      ) : null}

      {showTicketNotePrompt ? (
        <TextPromptModal
          title="Ticket note"
          label="Note for this table"
          initialValue={ticketNote}
          placeholder="Optional note"
          confirmLabel="Save"
          onClose={() => setShowTicketNotePrompt(false)}
          onConfirm={(note) => {
            setTicketNote(note)
            setShowTicketNotePrompt(false)
            if (note) flash('Ticket note saved')
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
                    <span className="dine-head-chip area">{table.area}</span>
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
                  Merge another open table into <strong>T{selected.label}</strong>.
                </p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setShowMerge(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {mergeTargets.length === 0 ? (
              <p className="modal-lead">No other open tables to merge.</p>
            ) : (
              <div className="dine-pick-grid">
                {mergeTargets.map((table) => (
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
                      <TableIcon seats={table.seats} busy />
                    </span>
                    <strong>T{table.label}-{table.seats}</strong>
                    <span className="dine-head-chip area">{table.area}</span>
                    <span className={`status-pill ${table.status}`}>{tableStatusLabel(table.status)}</span>
                    <span className="dine-pick-amt">{money(table.amount ?? 0)}</span>
                  </button>
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
