import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import ConfirmModal from '../components/ConfirmModal'
import MenuPicker from '../components/MenuPicker'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import TextPromptModal from '../components/TextPromptModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import { lineTotal, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, calcBillWithFoodVoucher, cashFromSettle, recipesFromDishes, settleAfterFoodVoucher } from '../lib/bill'
import { orderTaxBillOptions } from '../data/tax'
import { kitchenPendingLines } from '../lib/kitchenRouting'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'
import { IconBolt } from './quick-serve/QuickServeIcons'
import QuickServeMobileCart from './quick-serve/QuickServeMobileCart'
import QuickServeMobileTabs from './quick-serve/QuickServeMobileTabs'
import QuickServeQueue from './quick-serve/QuickServeQueue'
import QuickServeTicketPanel from './quick-serve/QuickServeTicketPanel'
import QuickServeToolbar from './quick-serve/QuickServeToolbar'
import QuickServeTools from './quick-serve/QuickServeTools'
import {
  quickServeOpenCount,
  quickServeTickets,
  serveNoFromTicket,
  guestNameFromTicket,
} from './quick-serve/quickServeTickets'
import { useQuickServeLayout } from './quick-serve/useQuickServeLayout'
import { useI18n } from '../locale/i18n'

type OrderTypeOpt = 'takeaway' | 'dine-in' | 'delivery'

function nextServeNo() {
  return nextSeq('quickServe')
}

function statusLabel(lines: { sent?: boolean }[]) {
  if (lines.length === 0) return { label: 'New', tone: 'muted' as const }
  if (lines.some((l) => !l.sent)) return { label: 'Open', tone: 'amber' as const }
  return { label: 'Sent', tone: 'teal' as const }
}

export default function QuickServePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { dishes } = useMasters()
  const { redeemGiftCard, taxes } = useCatalog()
  const { addCashIn } = useShift()
  const { activeBranchId, company } = useBranch()
  const { syncEpoch } = useSync()
  const {
    tickets,
    addTicket,
    updateTicket,
    addToTicket,
    changeTicketQty,
    sendTicketOrders,
    settleTicket,
    cancelTicket,
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  const [searchParams] = useSearchParams()
  const deepTicketId = searchParams.get('ticket')

  const qsRootRef = useRef<HTMLDivElement>(null)
  const { isMobile, mobileTab, setMobileTab } = useQuickServeLayout(qsRootRef)

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const [search, setSearch] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(() => deepTicketId)
  const [serveNo, setServeNo] = useState(0)
  const [orderType, setOrderType] = useState<OrderTypeOpt>('takeaway')
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [cartPulse, setCartPulse] = useState(false)
  const prevLineCount = useRef(0)

  const selected = tickets.find((t) => t.id === ticketId)

  useEffect(() => {
    setTicketNote(selected?.note?.trim() ?? '')
  }, [selected?.id, selected?.note])

  useEffect(() => {
    if (deepTicketId && tickets.some((t) => t.id === deepTicketId)) {
      setTicketId(deepTicketId)
      const hit = tickets.find((t) => t.id === deepTicketId)
      if (hit) setServeNo(serveNoFromTicket(hit))
      return
    }
    if (ticketId && tickets.some((t) => t.id === ticketId)) return
    if (deepTicketId) return
    const empty = [...tickets].reverse().find((t) => t.id.startsWith('qs-') && t.lines.length === 0)
    const open = empty ?? [...tickets].reverse().find((t) => t.id.startsWith('qs-'))
    if (open) {
      setTicketId(open.id)
      const match = open.customer.match(/#(\d+)/)
      setServeNo(match ? Number(match[1]) : 0)
      return
    }
    if (ticketId) return
    if (dayIsClosed) return
    const n = nextServeNo()
    const ticket: OpenTicket = {
      id: `qs-${Date.now()}`,
      type: 'takeaway',
      customer: `#${n} Quick Serve`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setServeNo(n)
  }, [ticketId, tickets, addTicket, dayIsClosed, deepTicketId])

  const lines = selected?.lines ?? []
  const pending = useMemo(() => kitchenPendingLines(lines, dishes).length, [lines, dishes])
  const goods = lineTotal(lines)
  const taxOpts = useMemo(
    () => orderTaxBillOptions(lines, dishes, taxes, company.enableTax !== false),
    [lines, dishes, taxes, company.enableTax],
  )
  const bill = useMemo(() => calcBill(goods, 0, [], taxOpts), [goods, taxOpts])
  const { tax, total, taxable } = bill
  const status = statusLabel(lines)

  const linkedCustomer = linkedCustomerId ? customers.find((c) => c.id === linkedCustomerId) : undefined

  const qsTickets = useMemo(() => quickServeTickets(tickets), [tickets])
  const qsOpenCount = useMemo(() => quickServeOpenCount(tickets), [tickets])

  function selectTicket(ticket: OpenTicket) {
    setTicketId(ticket.id)
    setServeNo(serveNoFromTicket(ticket))
    setTicketNote('')
    const guestName = guestNameFromTicket(ticket)
    const match = guestName ? customers.find((c) => c.name === guestName) : undefined
    setLinkedCustomerId(match?.id ?? null)
    if (isMobile) setMobileTab('menu')
  }

  function applyCustomer(customerId: string | null) {
    setLinkedCustomerId(customerId)
    setShowCustomer(false)
    if (!selected) return
    const n = serveNo || serveNoFromTicket(selected)
    if (!customerId) {
      updateTicket(selected.id, { customer: `#${n} Quick Serve` })
      flash(t.qsWalkIn)
      return
    }
    const c = customers.find((x) => x.id === customerId)
    if (!c) return
    updateTicket(selected.id, {
      customer: `#${n} Quick Serve · ${c.name}`,
      phone: c.phone,
    })
    flash(`Customer · ${c.name}`)
  }

  useEffect(() => {
    if (!isMobile || lines.length <= prevLineCount.current) {
      prevLineCount.current = lines.length
      return
    }
    prevLineCount.current = lines.length
    setCartPulse(true)
    const id = window.setTimeout(() => setCartPulse(false), 700)
    return () => window.clearTimeout(id)
  }, [lines.length, isMobile])

  const showMenu = !isMobile || mobileTab === 'menu'
  const showTicket = !isMobile || mobileTab === 'ticket'

  function newTicket() {
    if (dayIsClosed) {
      flash('Day is closed — reopen in Back Office')
      return
    }
    const n = nextServeNo()
    const ticket: OpenTicket = {
      id: `qs-${Date.now()}`,
      type: orderType === 'delivery' ? 'delivery' : 'takeaway',
      customer: linkedCustomer?.name
        ? `#${n} Quick Serve · ${linkedCustomer.name}`
        : `#${n} Quick Serve`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setServeNo(n)
    setTicketNote('')
    flash(`Quick Serve #${n}`)
  }

  function requestCancel() {
    if (!selected) return
    setCancelTargetId(selected.id)
    setShowCancel(true)
  }

  function removeFromQueue(ticket: OpenTicket) {
    if (dayIsClosed) {
      flash('Day is closed')
      return
    }
    if (ticket.lines.length === 0) {
      cancelTicket(ticket.id, 'Empty draft removed')
      if (ticketId === ticket.id) {
        setTicketId(null)
        setLinkedCustomerId(null)
        setTicketNote('')
      }
      flash(`Removed #${serveNoFromTicket(ticket)}`)
      return
    }
    setCancelTargetId(ticket.id)
    setShowCancel(true)
  }

  function confirmCancel() {
    const id = cancelTargetId ?? selected?.id
    if (!id) return
    cancelTicket(id, 'Cancelled from quick serve')
    setShowCancel(false)
    setCancelTargetId(null)
    if (ticketId === id) {
      setTicketId(null)
      setLinkedCustomerId(null)
      setTicketNote('')
    }
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    if (dayIsClosed) {
      flash('Day is closed')
      return
    }
    if (lines.length === 0) {
      flash('Add items before settle')
      return
    }
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
    const roundOff = Math.round((result.roundOff ?? 0) * 100) / 100
    const { bill: settledBill, payable, voucherSar } = settleAfterFoodVoucher({
      goods,
      taxOptions: taxOpts,
      baseBill: bill,
      foodVoucherSar: result.foodVoucherAmount,
      loyaltySar: redeemSar,
      roundOff,
    })
    const customerId = result.customerId ?? linkedCustomerId ?? undefined
    if (customerId) earnPoints(customerId, payable)
    const paySplits = (result.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
    const ids = buildReceiptIdentity({ ticketId: selected.id, staff: user })
    settleTicket(selected.id, {
      method: result.method,
      source: `Quick Serve #${serveNo || selected.customer}`,
      staff: user?.name,
      staffUsername: ids.user,
      billNo: ids.billNo,
      orderId: ids.orderId,
      subtotal: settledBill.taxable,
      tax: settledBill.tax,
      total: payable,
      roundOff: roundOff || undefined,
      tendered: result.tendered,
      change: result.change,
      lines,
      splitPayments: paySplits.length ? paySplits : undefined,
      customerId,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, paySplits.length ? paySplits : undefined))
    setShowSettle(false)
    setReceipt(
      attachZatcaToReceipt({
        title: `Quick Serve #${serveNo || selected.customer}`,
        method: result.method,
        lines,
        subtotal: goods,
        tax: settledBill.tax,
        total: payable,
        loyaltyRedeem: redeemSar || undefined,
        foodVoucherAmt: voucherSar || undefined,
        foodVoucherCode: result.foodVoucherCode,
        splitPayments: paySplits.length ? paySplits : undefined,
        staff: user?.name,
        staffUsername: ids.user,
        billNo: ids.billNo,
        orderId: ids.orderId,
        time: new Date().toLocaleString(),
        customerName: linkedCustomer?.name ?? selected.customer,
        kind: 'paid',
        orderType: selected.type,
      }),
    )
    flash(`Paid by ${result.method}`)
    setTicketId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  return (
    <div
      className={`zk-qs${isMobile ? ' qs-mobile' : ''}${isMobile ? ` qs-tab-${mobileTab}` : ''}`}
      ref={qsRootRef}
    >
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="qs-page">
        <QuickServeQueue
          tickets={qsTickets}
          selectedId={ticketId}
          dayIsClosed={dayIsClosed}
          onSelect={selectTicket}
          onNew={newTicket}
          onRemove={removeFromQueue}
        />

        <div className="qs-chrome">
          {isMobile ? (
            <QuickServeMobileTabs
              tab={mobileTab}
              lineCount={lines.length}
              total={total}
              onChange={setMobileTab}
            />
          ) : null}
          <QuickServeToolbar
            serveNo={serveNo}
            statusLabel={status.label}
            openCount={qsOpenCount}
            dayIsClosed={dayIsClosed}
            compact={isMobile}
            onNewTicket={newTicket}
          />
          <QuickServeTools
            perms={perms}
            dayIsClosed={dayIsClosed}
            pending={pending}
            linesCount={lines.length}
            compact={isMobile}
            onCustomer={() => setShowCustomer(true)}
            onNote={() => setShowNote(true)}
            onNewTicket={newTicket}
            onSend={() => {
              if (!selected || pending === 0) {
                flash('Nothing new to send')
                return
              }
              setShowSend(true)
            }}
            onTempBill={() => flash('Temporary bill printed to preview')}
          />
        </div>

        <div className="qs-desk">
          {showMenu ? (
            <section className="qs-menu-panel" id="qs-panel-menu" role={isMobile ? 'tabpanel' : undefined}>
              {selected ? (
                <MenuPicker
                  onAdd={(item, note) => {
                    if (dayIsClosed) {
                      flash('Day is closed')
                      return
                    }
                    addToTicket(selected.id, item, note)
                  }}
                />
              ) : (
                <div className="qs-empty">
                  <IconBolt />
                  <strong>Opening ticket…</strong>
                </div>
              )}
            </section>
          ) : null}

          {showTicket ? (
            <QuickServeTicketPanel
              panelId="qs-panel-ticket"
              isTabPanel={isMobile}
              serveNo={serveNo}
              status={status}
              selected={selected}
              linkedCustomer={linkedCustomer}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              ticketNote={ticketNote}
              lines={lines}
              taxable={taxable}
              tax={tax}
              total={total}
              pending={pending}
              perms={perms}
              dayIsClosed={dayIsClosed}
              onChangeQty={(lineId, delta) => {
                if (selected) changeTicketQty(selected.id, lineId, delta)
              }}
              onRemoveLine={(lineId, qty) => {
                if (selected) changeTicketQty(selected.id, lineId, -qty)
              }}
              onSend={() => {
                if (!pending) {
                  flash('Nothing new to send')
                  return
                }
                setShowSend(true)
              }}
              onSettle={() => setShowSettle(true)}
              onRequestPay={() => flash('Payment requested — cashier will settle')}
              onCancel={requestCancel}
            />
          ) : null}
        </div>
      </div>

      {isMobile && mobileTab === 'menu' && lines.length > 0 ? (
        <QuickServeMobileCart
          lineCount={lines.length}
          total={total}
          pulse={cartPulse}
          canSettle={perms.canSettle}
          dayIsClosed={dayIsClosed}
          onViewTicket={() => setMobileTab('ticket')}
          onSettle={() => setShowSettle(true)}
        />
      ) : null}

      <HubFooter
        backTo="/payments"
        backLabel={t.qsFooterUnsettled}
        actions={
          <Link to="/back-office" className="qs-foot-link">
            {t.qsPaidHistory}
          </Link>
        }
      />

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            setShowSend(false)
            flash(`KOT sent · ${priority}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title="Quick Serve"
          total={total}
          customers={customers}
          preselectCustomerId={linkedCustomerId ?? undefined}
          computeDue={(voucherSar, loyaltySar) => {
            const next = calcBillWithFoodVoucher(goods, 0, [], taxOpts, voucherSar)
            return Math.max(0, Math.round((next.total - loyaltySar) * 100) / 100)
          }}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="section-head">
              <h2>Select customer</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCustomer(false)}>
                Close
              </button>
            </div>
            <div className="method-grid">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => applyCustomer(null)}
              >
                {t.qsWalkIn}
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => applyCustomer(c.id)}
                >
                  {c.name} · {c.points} pts
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showNote ? (
        <TextPromptModal
          title="Ticket note"
          label="Note"
          initialValue={ticketNote}
          placeholder="Allergy, packing, call when ready…"
          confirmLabel="Save"
          cancelLabel="Close"
          onClose={() => setShowNote(false)}
          onConfirm={(value) => {
            const cleaned = value.trim()
            setTicketNote(cleaned)
            setShowNote(false)
            if (selected) updateTicket(selected.id, { note: cleaned || undefined })
            if (cleaned) flash('Note saved')
          }}
        />
      ) : null}

      {showCancel && (cancelTargetId ?? selected) ? (
        <ConfirmModal
          title="Cancel ticket"
          message={(() => {
            const target = tickets.find((t) => t.id === (cancelTargetId ?? selected?.id))
            const no = target ? serveNoFromTicket(target) : serveNo
            const sent = target?.lines.some((l) => l.sent)
            return sent
              ? `Cancel Quick Serve #${no}? Kitchen may already have items.`
              : `Cancel Quick Serve #${no}? This removes the ticket.`
          })()}
          confirmLabel="Cancel ticket"
          cancelLabel="Keep ticket"
          danger
          onClose={() => {
            setShowCancel(false)
            setCancelTargetId(null)
          }}
          onConfirm={confirmCancel}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
