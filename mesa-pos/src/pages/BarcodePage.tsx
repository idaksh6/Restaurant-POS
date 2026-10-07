import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import CustomizerModal from '../components/CustomizerModal'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import QtyStepper from '../components/QtyStepper'
import ReceiptModal, { type ReceiptData } from '../components/ReceiptModal'
import SendOrdersModal from '../components/SendOrdersModal'
import SettleModal, { type SettleResult } from '../components/SettleModal'
import { redeemFoodVoucher } from '../data/foodVouchers'
import type { MasterDish } from '../data/masters'
import { normalizeDishCode } from '../data/masters'
import { lineTotal, money, nowTime, type MenuItem, type OpenTicket, type StockItem } from '../data/mock'
import { hydrateSequencesFromApi, nextSeq } from '../data/sequences'
import { companyDefaultTaxPercent, orderTaxBillOptions, vatDisplayLabel } from '../data/tax'
import { attachZatcaToReceipt } from '../hardware/zatca'
import { buildReceiptIdentity } from '../lib/receiptIds'
import {
  calcBill,
  calcBillWithFoodVoucher,
  cashFromSettle,
  recipesFromDishes,
  settleAfterFoodVoucher,
} from '../lib/bill'
import { kitchenPendingLines } from '../lib/kitchenRouting'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'

function findDishByScan(
  raw: string,
  dishes: MasterDish[],
  stock: StockItem[],
): MasterDish | undefined {
  const code = raw.trim()
  if (!code) return undefined
  const norm = normalizeDishCode(code)
  const active = dishes.filter((d) => d.active !== false)

  const byCode = active.find((d) => normalizeDishCode(d.code) === norm)
  if (byCode) return byCode

  if (/^\d+$/.test(norm)) {
    const stripped = norm.replace(/^0+/, '') || '0'
    const byPlu = active.find(
      (d) => normalizeDishCode(d.code).replace(/^0+/, '') === stripped,
    )
    if (byPlu) return byPlu
  }

  const byAlias = active.find(
    (d) => d.alias && normalizeDishCode(d.alias) === norm,
  )
  if (byAlias) return byAlias

  const byName = active.find((d) => d.name.trim().toLowerCase() === norm)
  if (byName) return byName

  const stockHit = stock.find((s) => s.sku && normalizeDishCode(s.sku) === norm)
  if (stockHit?.sku) {
    const skuNorm = normalizeDishCode(stockHit.sku)
    return active.find((d) => normalizeDishCode(d.code) === skuNorm)
  }

  return undefined
}

export default function BarcodePage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const perms = user ? getPermissions(user.role) : getPermissions('cashier')
  const { dishes } = useMasters()
  const { taxes, redeemGiftCard } = useCatalog()
  const { customers, earnPoints, redeemPoints } = useCrm()
  const { addCashIn } = useShift()
  const { activeBranchId, company } = useBranch()
  const { syncEpoch } = useSync()
  const {
    tickets,
    stock,
    addTicket,
    addToTicket,
    changeTicketQty,
    sendTicketOrders,
    settleTicket,
    cancelTicket,
    deductRecipeStock,
    flash,
    dayIsClosed,
  } = usePos()

  const scanRef = useRef<HTMLInputElement>(null)
  const [searchParams] = useSearchParams()
  const deepTicketId = searchParams.get('ticket')
  const [scan, setScan] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(() => deepTicketId)
  const [lastHit, setLastHit] = useState<string>('')
  const [customDish, setCustomDish] = useState<MasterDish | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [showSettle, setShowSettle] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [headerSearch, setHeaderSearch] = useState('')

  useEffect(() => {
    void hydrateSequencesFromApi().catch(() => undefined)
  }, [syncEpoch, activeBranchId])

  const barcodeTickets = useMemo(
    () => tickets.filter((tk) => tk.id.startsWith('bc-')),
    [tickets],
  )

  useEffect(() => {
    if (deepTicketId && barcodeTickets.some((tk) => tk.id === deepTicketId)) {
      setTicketId(deepTicketId)
      return
    }
    if (ticketId && barcodeTickets.some((tk) => tk.id === ticketId)) return
    if (deepTicketId) return
    const empty = [...barcodeTickets].reverse().find((tk) => tk.lines.length === 0)
    const open = empty ?? [...barcodeTickets].reverse()[0]
    if (open) {
      setTicketId(open.id)
      return
    }
    if (dayIsClosed) return
    createTicket(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once when empty
  }, [barcodeTickets, ticketId, dayIsClosed, deepTicketId])

  useEffect(() => {
    scanRef.current?.focus()
  }, [ticketId, showSend, showSettle, customDish, receipt])

  const selected = barcodeTickets.find((tk) => tk.id === ticketId) ?? null
  const lines = selected?.lines ?? []
  const pending = useMemo(() => kitchenPendingLines(lines, dishes).length, [lines, dishes])
  const goods = lineTotal(lines)
  const taxOpts = useMemo(
    () => orderTaxBillOptions(lines, dishes, taxes, company.enableTax !== false),
    [lines, dishes, taxes, company.enableTax],
  )
  const bill = useMemo(() => calcBill(goods, 0, [], taxOpts), [goods, taxOpts])
  const { tax, total, taxable } = bill
  const vatLabel = vatDisplayLabel(companyDefaultTaxPercent(taxes))

  function focusScan() {
    window.setTimeout(() => scanRef.current?.focus(), 30)
  }

  function createTicket(quiet = false) {
    if (dayIsClosed) {
      flash(t.dayClosedHint)
      return
    }
    const n = nextSeq('takeaway')
    const ticket: OpenTicket = {
      id: `bc-${n}-${Date.now()}`,
      type: 'takeaway',
      customer: `${t.bcTicketLabel} #${n}`,
      channel: 'barcode',
      openedAt: nowTime(),
      lines: [],
    }
    addTicket(ticket)
    setTicketId(ticket.id)
    setLastHit('')
    if (!quiet) flash(`${t.tileBarcode} #${n}`)
    focusScan()
  }

  function addDish(dish: MasterDish | MenuItem, note?: string) {
    if (!selected) {
      flash(t.bcNeedTicket, 'err')
      return
    }
    if (dayIsClosed) {
      flash(t.dayClosedHint)
      return
    }
    addToTicket(selected.id, dish, note)
    setLastHit(`${dish.name} · ${money(dish.price, lang)}`)
    flash(`${dish.name} · ${t.bcAdded}`, 'ok', 1400)
    setScan('')
    focusScan()
  }

  function onScanSubmit() {
    const code = scan.trim()
    if (!code) return
    if (!selected) {
      createTicket(true)
      // defer scan until ticket exists on next tick
      window.setTimeout(() => {
        setScan(code)
        scanRef.current?.focus()
      }, 0)
      return
    }
    const dish = findDishByScan(code, dishes, stock)
    if (!dish) {
      flash(t.pluNotFound.replace('{code}', code), 'err')
      setScan('')
      focusScan()
      return
    }
    if (dish.customizer) {
      setCustomDish(dish)
      return
    }
    addDish(dish)
  }

  function completeSettle(result: SettleResult) {
    if (!selected) return
    if (dayIsClosed) {
      flash(t.dayClosedHint)
      return
    }
    if (lines.length === 0) {
      flash(t.bcEmptyCart, 'err')
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
    const customerId = result.customerId
    if (customerId) earnPoints(customerId, payable)
    const paySplits = (result.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
    const ids = buildReceiptIdentity({ ticketId: selected.id, staff: user })
    settleTicket(selected.id, {
      method: result.method,
      source: `${t.tileBarcode} · ${selected.customer}`,
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
        title: `${t.tileBarcode} · ${selected.customer}`,
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
        customerName: selected.customer,
        kind: 'paid',
        orderType: selected.type,
      }),
    )
    flash(`${t.settle} · ${result.method}`)
    setTicketId(null)
    setLastHit('')
  }

  return (
    <div className="zk-bc">
      <DashHeader search={headerSearch} onSearchChange={setHeaderSearch} brandTo="/" />

      <div className="bc-page">
        <header className="bc-hero">
          <div className="bc-hero-copy">
            <span className="bc-hero-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 5v14M8 5v14M10.5 5v9M13 5v14M16 5v10M19 5v14" />
              </svg>
            </span>
            <div>
              <h1>{t.tileBarcode}</h1>
              <p>{t.bcHint}</p>
            </div>
          </div>
          <div className="bc-hero-actions">
            {dayIsClosed ? <span className="bc-pill closed">{t.dayClosed}</span> : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={dayIsClosed}
              onClick={() => createTicket()}
            >
              {t.bcNewTicket}
            </button>
          </div>
        </header>

        <section className="bc-scan-card">
          <label className="bc-scan-label" htmlFor="bc-scan-input">
            {t.bcScanLabel}
          </label>
          <div className="bc-scan-row">
            <input
              id="bc-scan-input"
              ref={scanRef}
              className="bc-scan-input mesa-ltr-nums"
              value={scan}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t.bcScanPlaceholder}
              disabled={dayIsClosed || !selected}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onScanSubmit()
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={dayIsClosed || !selected || !scan.trim()}
              onClick={onScanSubmit}
            >
              {t.bcAdd}
            </button>
          </div>
          <p className="bc-scan-help">{t.bcScanHelp}</p>
          {lastHit ? <p className="bc-last-hit mesa-ltr-nums">{lastHit}</p> : null}
        </section>

        <div className="bc-desk">
          <section className="bc-ticket">
            <div className="bc-ticket-head">
              <div>
                <strong>{selected?.customer ?? t.bcNeedTicket}</strong>
                <span>
                  {lines.length === 0
                    ? t.taStatusNew
                    : pending > 0
                      ? t.taStatusOpen
                      : t.taStatusSent}
                </span>
              </div>
              <span className="mesa-ltr-nums">{money(total, lang)}</span>
            </div>

            {lines.length === 0 ? (
              <div className="bc-empty">
                <strong>{t.bcEmptyCart}</strong>
                <span>{t.bcEmptyCartHint}</span>
              </div>
            ) : (
              <ul className="bc-lines">
                {lines.map((line) => (
                  <li key={line.id}>
                    <div>
                      <strong>{line.name}</strong>
                      {line.note ? <small>{line.note}</small> : null}
                      <em className="mesa-ltr-nums">{money(line.price * line.qty, lang)}</em>
                    </div>
                    <QtyStepper
                      value={line.qty}
                      ariaLabel={line.name}
                      disabled={dayIsClosed}
                      minusDisabled={Boolean(line.sent)}
                      inputDisabled={Boolean(line.sent)}
                      onChange={(delta) => {
                        if (!selected) return
                        changeTicketQty(selected.id, line.id, delta)
                        focusScan()
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="bc-totals mesa-ltr-nums">
              <div>
                <span>{t.subtotal}</span>
                <strong>{money(taxable, lang)}</strong>
              </div>
              <div>
                <span>{vatLabel}</span>
                <strong>{money(tax, lang)}</strong>
              </div>
              <div className="bc-total">
                <span>{t.rptAmount}</span>
                <strong>{money(total, lang)}</strong>
              </div>
            </div>

            <div className="bc-actions">
              <button
                type="button"
                className="btn"
                disabled={!selected || lines.length === 0 || pending === 0 || dayIsClosed}
                onClick={() => setShowSend(true)}
              >
                {t.bcSendKitchen}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selected || lines.length === 0 || !perms.canSettle || dayIsClosed}
                onClick={() => setShowSettle(true)}
              >
                {t.bcSettle}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!selected || dayIsClosed}
                onClick={() => {
                  if (!selected) return
                  cancelTicket(selected.id)
                  setTicketId(null)
                  setLastHit('')
                  flash(t.bcCancelled)
                  focusScan()
                }}
              >
                {t.bcCancel}
              </button>
            </div>
          </section>

          <aside className="bc-queue">
            <h2>{t.bcOpenTickets}</h2>
            {barcodeTickets.length === 0 ? (
              <p className="bc-muted">{t.bcNoTickets}</p>
            ) : (
              <ul>
                {barcodeTickets.map((tk) => {
                  const amt = calcBill(
                    lineTotal(tk.lines),
                    0,
                    [],
                    orderTaxBillOptions(tk.lines, dishes, taxes, company.enableTax !== false),
                  ).total
                  return (
                    <li key={tk.id}>
                      <button
                        type="button"
                        className={tk.id === selected?.id ? 'on' : ''}
                        onClick={() => {
                          setTicketId(tk.id)
                          focusScan()
                        }}
                      >
                        <strong>{tk.customer}</strong>
                        <span className="mesa-ltr-nums">
                          {tk.lines.length} · {money(amt, lang)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link to="/payments" className="bc-queue-link">
              {t.tileUnsettled}
            </Link>
          </aside>
        </div>
      </div>

      <HubFooter backTo="/" backLabel={t.navHome} />

      {customDish ? (
        <CustomizerModal
          dish={customDish}
          onClose={() => {
            setCustomDish(null)
            setScan('')
            focusScan()
          }}
          onSave={({ name, price, note }) => {
            addDish({ ...customDish, name, price }, note)
            setCustomDish(null)
          }}
        />
      ) : null}

      {showSend && selected ? (
        <SendOrdersModal
          pendingCount={pending}
          onClose={() => {
            setShowSend(false)
            focusScan()
          }}
          onSend={(priority) => {
            sendTicketOrders(selected.id, priority)
            setShowSend(false)
            flash(t.bcSent)
            focusScan()
          }}
        />
      ) : null}

      {showSettle && selected ? (
        <SettleModal
          title={selected.customer}
          total={total}
          customers={customers}
          computeDue={(voucherSar, loyaltySar) => {
            const next = calcBillWithFoodVoucher(goods, 0, [], taxOpts, voucherSar)
            return Math.max(0, Math.round((next.total - loyaltySar) * 100) / 100)
          }}
          onClose={() => {
            setShowSettle(false)
            focusScan()
          }}
          onConfirm={completeSettle}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
