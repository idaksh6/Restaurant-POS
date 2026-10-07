import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import CustomerSearchPanel from '../components/CustomerSearchPanel'
import MesaSelect from '../components/MesaSelect'
import MenuPicker from '../components/MenuPicker'
import QtyStepper from '../components/QtyStepper'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import { buildReceiptIdentity } from '../lib/receiptIds'
import { IconTrash } from './quick-serve/QuickServeIcons'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { lineTotal, money, nowTime, type OpenTicket } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { calcBill, cashFromSettle, recipesFromDishes } from '../lib/bill'
import { companyDefaultTaxPercent, orderTaxBillOptions, vatDisplayLabel, vatRateLabel } from '../data/tax'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'

type OrderTypeOpt = 'drive-thru' | 'takeaway' | 'dine-in' | 'delivery'

function nextLaneNo() {
  return nextSeq('driveThru')
}

export default function DriveThruPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
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
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const [searchParams] = useSearchParams()
  const deepTicketId = searchParams.get('ticket')
  const [ticketId, setTicketId] = useState<string | null>(() => deepTicketId)
  const [laneNo, setLaneNo] = useState(0)
  const [orderType, setOrderType] = useState<OrderTypeOpt>('drive-thru')
  const [ticketNote, setTicketNote] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [showKeypad, setShowKeypad] = useState(false)
  const [keypadCode, setKeypadCode] = useState('')
  const [search, setSearch] = useState('')

  const selected = tickets.find((t) => t.id === ticketId)

  useEffect(() => {
    setTicketNote(selected?.note?.trim() ?? '')
  }, [selected?.id, selected?.note])

  const driveTickets = useMemo(
    () => tickets.filter((t) => t.id.startsWith('dt-')),
    [tickets],
  )

  useEffect(() => {
    if (deepTicketId && tickets.some((t) => t.id === deepTicketId)) {
      setTicketId(deepTicketId)
      const hit = tickets.find((t) => t.id === deepTicketId)
      const match = hit?.customer.match(/#(\d+)/)
      setLaneNo(match ? Number(match[1]) : 0)
      return
    }
    if (ticketId && tickets.some((t) => t.id === ticketId)) {
      const hit = tickets.find((t) => t.id === ticketId)
      const match = hit?.customer.match(/#(\d+)/)
      if (match) setLaneNo(Number(match[1]))
      return
    }
    // Do not auto-create a lane on open — only New lane / New does that.
    if (ticketId) setTicketId(null)
    if (!deepTicketId) setLaneNo(0)
  }, [ticketId, tickets, deepTicketId])

  const lines = selected?.lines ?? []
  const pending = lines.filter((l) => !l.sent).length
  const goods = lineTotal(lines)
  const taxOpts = useMemo(
    () => orderTaxBillOptions(lines, dishes, taxes, company.enableTax !== false),
    [lines, dishes, taxes, company.enableTax],
  )
  const bill = useMemo(() => calcBill(goods, 0, [], taxOpts), [goods, taxOpts])
  const { tax, total, taxByRate } = bill
  const vatLabel = vatDisplayLabel(companyDefaultTaxPercent(taxes), taxByRate.length > 1)

  const linkedCustomer = linkedCustomerId
    ? customers.find((c) => c.id === linkedCustomerId)
    : undefined

  function orderTypeLabel(opt: OrderTypeOpt) {
    if (opt === 'drive-thru') return t.navDriveThru
    if (opt === 'takeaway') return t.navTakeaway
    if (opt === 'dine-in') return t.dineIn
    return t.navDelivery
  }

  function newTicket() {
    if (dayIsClosed) {
      flash(t.dayClosedHint)
      return
    }
    const n = nextLaneNo()
    const ticket: OpenTicket = {
      id: `dt-${Date.now()}`,
      type: orderType === 'delivery' ? 'delivery' : 'takeaway',
      customer: linkedCustomer?.name
        ? `#${n} ${t.dtDriveThruCustomer} · ${linkedCustomer.name}`
        : `#${n} ${t.dtDriveThruCustomer}`,
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setLaneNo(n)
    setTicketNote('')
    flash(`${t.dtNewLaneFlash} · #${n}`)
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    const redeemSar = result.loyaltyRedeemSar ?? 0
    if (result.customerId && (result.loyaltyRedeemPts ?? 0) > 0) {
      redeemPoints(result.customerId, result.loyaltyRedeemPts!)
    }
    if (result.giftCardId && (result.giftCardAmount ?? 0) > 0) {
      redeemGiftCard(result.giftCardId, result.giftCardAmount!)
    }
    const roundOff = Math.round((result.roundOff ?? 0) * 100) / 100
    const payable = Math.max(0, Math.round((total - redeemSar + roundOff) * 100) / 100)
    if (result.customerId) earnPoints(result.customerId, payable)
    settleTicket(selected.id, {
      method: result.method,
      source: `${t.navDriveThru} #${laneNo}`,
      staff: user?.name,
      subtotal: bill.taxable,
      tax,
      total: payable,
      roundOff: roundOff || undefined,
      tendered: result.tendered,
      change: result.change,
      lines,
      splitPayments: result.splitPayments,
      customerId: result.customerId ?? linkedCustomerId ?? undefined,
      loyaltyRedeem: redeemSar || undefined,
    })
    deductRecipeStock(lines, recipesFromDishes(dishes))
    addCashIn(cashFromSettle(result.method, payable, result.splitPayments))
    setShowSettle(false)
    flash(`${t.dtPaid} · ${t.navDriveThru} #${laneNo} · ${result.method}`)
    setTicketId(null)
    setLinkedCustomerId(null)
    setTicketNote('')
  }

  function tempBill() {
    if (!selected || lines.length === 0) {
      flash(t.dtAddItemsFirst)
      return
    }
    setReceipt({
      title: `${t.navDriveThru} #${laneNo} · ${t.dtTempBillTitle}`,
      method: t.dtTempBillMethod,
      lines,
      subtotal: bill.taxable,
      tax,
      total,
      staff: user?.name,
      ...(() => {
        const ids = buildReceiptIdentity({ ticketId: selected.id, staff: user })
        return {
          staffUsername: ids.user,
          billNo: ids.billNo,
          orderId: ids.orderId,
        }
      })(),
      time: nowTime(),
      customerName: linkedCustomer?.name,
      kind: 'guest',
      orderType: 'takeaway',
    })
  }

  function voidLastNew() {
    if (!selected) return
    const last = [...lines].reverse().find((l) => !l.sent)
    if (!last) {
      flash(t.dtNoUnsentReturn)
      return
    }
    changeTicketQty(selected.id, last.id, -last.qty)
    flash(`${t.dtReturned} · ${last.name}`)
  }

  function addByCode() {
    if (!selected || !keypadCode.trim()) return
    const dish = dishes.find(
      (d) => d.active && (d.code === keypadCode.trim() || d.name.toLowerCase() === keypadCode.trim().toLowerCase()),
    )
    if (!dish) {
      flash(t.dtCodeNotFound)
      return
    }
    addToTicket(selected.id, dish)
    setKeypadCode('')
    flash(`${dish.name} · ${t.dtAdded}`, 'ok', 1400)
  }

  const nowLabel = useMemo(
    () =>
      new Date().toLocaleString('en-SA', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [],
  )

  return (
    <div className="zk-dt">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="dt-page">
        <header className="dt-toolbar">
          <div className="dt-toolbar-brand">
            <span className="dt-hero-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 14h16l-1.5-5H6L4 14Z" />
                <path d="M7 9 8.2 6h7.6L17 9" />
                <circle cx="7.5" cy="16.5" r="1.6" />
                <circle cx="16.5" cy="16.5" r="1.6" />
              </svg>
            </span>
            <div>
              <h1>{t.navDriveThru}</h1>
              <p>
                #{laneNo || '—'} · {lines.length === 0 ? t.dtNewOrder : pending > 0 ? t.taStatusOpen : t.taStatusSent}
                {driveTickets.length > 1 ? ` · ${driveTickets.length} ${t.dtLanes}` : ''}
              </p>
            </div>
          </div>
          <div className="dt-toolbar-actions">
            <span className="dt-clock mesa-ltr-nums">{nowLabel}</span>
            {dayIsClosed ? <span className="dt-pill closed">{t.dayClosed}</span> : null}
            <button
              type="button"
              className="btn btn-primary dt-new-btn"
              disabled={dayIsClosed}
              onClick={newTicket}
            >
              {t.dtNewLane}
            </button>
          </div>
        </header>

        <div className="dt-shell">
        <aside className="dt-actions">
          <Link to="/dine-in" className="dt-action">
            {t.dtSelectTable}
          </Link>
          <button type="button" className="dt-action" onClick={() => setShowCustomer(true)}>
            {t.taSelectCustomer}
          </button>
          <button
            type="button"
            className="dt-action"
            onClick={() => flash(t.dtMergeHint)}
          >
            {t.dtMerge}
          </button>
          <button
            type="button"
            className="dt-action"
            onClick={() => {
              const note = window.prompt(t.dtTicketNote, ticketNote) ?? ticketNote
              const cleaned = note.trim()
              setTicketNote(cleaned)
              if (selected) updateTicket(selected.id, { note: cleaned || undefined })
              if (cleaned) flash(t.dlNoteSaved)
            }}
          >
            {t.dtTicketNote}
          </button>
          <button type="button" className="dt-action" onClick={voidLastNew}>
            {t.dtReturn}
          </button>
          <button type="button" className="dt-action" onClick={newTicket}>
            {t.dtNew}
          </button>
          {perms.canSendOrders ? (
            <button
              type="button"
              className="dt-action accent"
              onClick={() => {
                if (!selected || pending === 0) {
                  flash(t.taNothingToSend)
                  return
                }
                setShowSend(true)
              }}
            >
              {t.sendOrders}{pending > 0 ? ` (${pending})` : ''}
            </button>
          ) : null}
          <button
            type="button"
            className="dt-action"
            onClick={() => flash(t.dtPriorityFlash)}
          >
            {t.dtOrderPriority}
          </button>
          <Link to="/delivery" className="dt-action">
            {t.dtDeliveryBoy}
          </Link>
          <button
            type="button"
            className="dt-action"
            disabled={lines.length === 0}
            onClick={tempBill}
          >
            {t.tempBill}
          </button>
        </aside>

        <section className="dt-ticket panel">
          <div className="dt-ticket-head">
            <div>
              <h2>
                #{laneNo || '—'} <em>{t.navDriveThru}</em>
              </h2>
              <div className="dt-chips">
                <span className="chip">{orderTypeLabel(orderType)}</span>
                {linkedCustomer ? <span className="chip">{linkedCustomer.name}</span> : null}
                {driveTickets.length > 1 ? (
                  <span className="chip">{driveTickets.length} {t.taOpenWord}</span>
                ) : null}
              </div>
            </div>
            <label className="dt-type">
              {t.dtChangeType}
              <MesaSelect
                value={orderType}
                onChange={(v) => setOrderType(v as OrderTypeOpt)}
                options={[
                  { value: 'drive-thru', label: t.navDriveThru },
                  { value: 'takeaway', label: t.navTakeaway },
                  { value: 'dine-in', label: t.dineIn },
                  { value: 'delivery', label: t.navDelivery },
                ]}
              />
            </label>
          </div>

          <div className="dt-status">
            <div>
              <span>{t.status}</span>
              <strong>{lines.length === 0 ? t.dtNewOrder : pending > 0 ? t.dtStatusUnpaidOpen : t.dtStatusSentUnpaid}</strong>
            </div>
            <button type="button" className="dt-plus" onClick={newTicket} title={t.qsNewTicket}>
              +
            </button>
          </div>

          {ticketNote ? <p className="dt-note">{t.taNoteLabel}: {ticketNote}</p> : null}

          <div className="dt-lines">
            <div className="dt-lines-head">
              <span>{t.printColItem}</span>
              <span className="num">{t.printColTotal}</span>
            </div>
            {lines.length === 0 ? (
              <div className="ticket-empty">
                <strong>{selected ? t.dtLaneReady : t.dtNoLane}</strong>
                {selected ? t.dtLaneReadyHint : t.dtNoLaneHint}
              </div>
            ) : (
              <div className="dt-group">
                <header>{t.dtNewOrderHeader}</header>
                {lines.map((line) => (
                  <article key={line.id} className={`dt-line${line.sent ? ' sent' : ''}`}>
                    <div className="dt-line-body">
                      <div className="dt-line-top">
                        <h3 className="dt-line-name">{line.name}</h3>
                        <strong className="dt-line-total">{money(line.qty * line.price, lang)}</strong>
                      </div>
                      <div className="dt-line-bottom">
                        <div className="dt-line-meta">
                          <span>{money(line.price, lang)} {t.dtEach}</span>
                          <span className={`dt-line-badge${line.sent ? ' sent' : ''}`}>
                            {line.sent ? t.taStatusSent : t.taStatusNew}
                          </span>
                          {line.note ? <span className="dt-line-note">{line.note}</span> : null}
                        </div>
                        <QtyStepper
                          className="dt-qty"
                          value={line.qty}
                          ariaLabel={line.name}
                          minusDisabled={line.sent}
                          inputDisabled={line.sent}
                          onChange={(delta) => selected && changeTicketQty(selected.id, line.id, delta)}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="dt-line-remove"
                      aria-label={`${t.dtRemoveItem} ${line.name}`}
                      title={t.dtRemoveItem}
                      disabled={dayIsClosed || line.sent}
                      onClick={() => selected && changeTicketQty(selected.id, line.id, -line.qty)}
                    >
                      <IconTrash />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="dt-totals">
            <div>
              <span>{t.dtTicketTotal}</span>
              <span>{money(goods, lang)}</span>
            </div>
            {taxByRate.length > 0
              ? taxByRate.map((row) => (
                  <div key={`vat-${row.percent}`}>
                    <span>{vatRateLabel(row.percent)}</span>
                    <span>{money(row.tax, lang)}</span>
                  </div>
                ))
              : (
                  <div>
                    <span>{vatLabel}</span>
                    <span>{money(tax, lang)}</span>
                  </div>
                )}
            <div className="grand">
              <span>{t.dtBalance}</span>
              <span>{money(total, lang)}</span>
            </div>
          </div>

          <div className="dt-ticket-actions">
            {perms.canSettle ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={lines.length === 0 || dayIsClosed}
                onClick={() => setShowSettle(true)}
              >
                {t.settle}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={lines.length === 0}
                onClick={() => flash(t.dlRequestPayFlash)}
              >
                {t.requestPayment}
              </button>
            )}
            <Link to="/" className="btn btn-ghost">
              {t.printClose}
            </Link>
          </div>
        </section>

        <section className="dt-menu panel">
          {selected ? (
            <MenuPicker onAdd={(item, note) => addToTicket(selected.id, item, note)} />
          ) : (
            <div className="ticket-empty">
              <strong>{t.dtNoLane}</strong>
              {t.dtNoLaneHint}
            </div>
          )}
          <button type="button" className="dt-keypad-btn" onClick={() => setShowKeypad(true)}>
            {t.dtKeypad}
          </button>
        </section>
        </div>
      </div>

      <HubFooter
        backTo="/quick-serve"
        backLabel={t.tileQuickServe}
        actions={<span className="dt-foot-meta">{user?.name ?? user?.roleLabel}</span>}
      />

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => setShowSend(false)}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            setShowSend(false)
            flash(`${t.dlKotSent} · ${priority}`)
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={`${t.navDriveThru} #${laneNo}`}
          total={total}
          customers={customers}
          preselectCustomerId={linkedCustomerId ?? undefined}
          onClose={() => setShowSettle(false)}
          onConfirm={completeSettle}
        />
      ) : null}

      {showCustomer ? (
        <CustomerSearchPanel
          selectedId={linkedCustomerId}
          onClose={() => setShowCustomer(false)}
          onSelect={(c) => {
            setLinkedCustomerId(c?.id ?? null)
            setShowCustomer(false)
            flash(c ? `${t.dlCustomer} · ${c.name}` : t.taWalkIn)
          }}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}

      {showKeypad ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card dt-keypad-modal">
            <div className="section-head">
              <h2>{t.dtItemKeypad}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowKeypad(false)}>
                {t.printClose}
              </button>
            </div>
            <p className="modal-lead">{t.dtKeypadHint}</p>
            <input
              className="search"
              value={keypadCode}
              onChange={(e) => setKeypadCode(e.target.value)}
              placeholder={t.dtProductCode}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') addByCode()
              }}
            />
            <div className="dt-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setKeypadCode('')
                    else if (k === '⌫') setKeypadCode((v) => v.slice(0, -1))
                    else setKeypadCode((v) => `${v}${k}`)
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={addByCode}>
              {t.dtAddItem}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
