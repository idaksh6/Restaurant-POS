import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import GiftCardPayModal, { type GiftCardPayResult } from './GiftCardPayModal'
import MesaSelect from './MesaSelect'
import FoodVoucherPayModal, { type FoodVoucherPayResult } from './FoodVoucherPayModal'
import { money } from '../data/mock'
import { paymentParents, ensurePaymentTypes, type PaymentParent } from '../data/paymentTypes'
import {
  methodNeedsCardTerminal,
  requestCardPayment,
} from '../hardware/cardTerminal'
import { paymentMethods } from '../locale/saudi'
import { useI18n, type Dict } from '../locale/i18n'
import { SAR_PER_POINT } from '../state/CrmContext'
import { useCatalog } from '../state/CatalogContext'

const singleMethods = paymentMethods.filter((m) => m !== 'Split bill')

export type SplitPayment = {
  method: string
  amount: number
  cardAuthCode?: string
  cardRrn?: string
}

export type SettleResult = {
  method: string
  splitParts?: number
  splitPayments?: SplitPayment[]
  tendered?: number
  change?: number
  /** Cash whole-riyal round-up absorbed into the bill (no change given). */
  roundOff?: number
  customerId?: string
  loyaltyRedeemPts?: number
  loyaltyRedeemSar?: number
  giftCardId?: string
  giftCardNumber?: string
  giftCardAmount?: number
  foodVoucherId?: string
  foodVoucherCode?: string
  foodVoucherAmount?: number
  cardAuthCode?: string
  cardRrn?: string
}

export type SettleCustomer = {
  id: string
  name: string
  points: number
  phone?: string
}

type Props = {
  total: number
  title: string
  initialMethod?: (typeof paymentMethods)[number] | null
  startInSplit?: boolean
  customers?: SettleCustomer[]
  preselectCustomerId?: string
  /**
   * Amount still due after food voucher (pre-VAT discount) and loyalty.
   * Defaults to total − voucher − loyalty when omitted.
   */
  computeDue?: (voucherSar: number, loyaltySar: number) => number
  onClose: () => void
  onConfirm: (result: SettleResult) => void
}

type SplitMode = 'equal' | 'custom'

const quickDenoms = [5, 10, 20, 50, 100, 500]

function parentPayLabel(id: PaymentParent, t: Dict): string {
  switch (id) {
    case 'cash':
      return t.cash
    case 'card':
      return t.card
    case 'voucher':
      return t.settlePayVoucher
    case 'online':
      return t.settlePayOnline
    case 'other':
      return t.settlePayOther
  }
}

export default function SettleModal({
  total,
  title,
  initialMethod = null,
  startInSplit = false,
  customers = [],
  preselectCustomerId,
  computeDue,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n()
  const { paymentTypes } = useCatalog()
  const payTypes = useMemo(
    () => ensurePaymentTypes(paymentTypes).filter((p) => p.active),
    [paymentTypes],
  )
  const [method, setMethod] = useState<string | null>(
    startInSplit ? 'Split bill' : initialMethod,
  )
  const [parentPick, setParentPick] = useState<PaymentParent | null>(null)
  const [parts, setParts] = useState(2)
  const [tendered, setTendered] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>(startInSplit ? 'custom' : 'equal')
  const [payments, setPayments] = useState<SplitPayment[]>([])
  const [payMethod, setPayMethod] = useState(String(singleMethods[0]))
  const [payAmount, setPayAmount] = useState('')
  const [customerId, setCustomerId] = useState(preselectCustomerId ?? '')
  const [redeemPts, setRedeemPts] = useState('')
  const [showGiftPay, setShowGiftPay] = useState(false)
  const [showFoodVoucher, setShowFoodVoucher] = useState(false)
  const [pendingGift, setPendingGift] = useState<GiftCardPayResult | null>(null)
  const [pendingVoucher, setPendingVoucher] = useState<FoodVoucherPayResult | null>(null)
  const [cardBusy, setCardBusy] = useState(false)
  const [cardError, setCardError] = useState('')

  const customer = customers.find((c) => c.id === customerId)
  const redeemPtsNum = Math.min(
    Math.max(0, Math.floor(Number(redeemPts) || 0)),
    customer?.points ?? 0,
  )
  const redeemSar = Math.round(redeemPtsNum * SAR_PER_POINT * 100) / 100
  const voucherSar = pendingVoucher?.amount ?? 0
  const due = Math.max(
    0,
    Math.round(
      (computeDue
        ? computeDue(voucherSar, redeemSar)
        : total - redeemSar - voucherSar) * 100,
    ) / 100,
  )

  const cashValue = Number(tendered) || 0
  const change = cashValue - due
  const perPart = due / parts

  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100
  const remaining = Math.max(0, Math.round((due - paid) * 100) / 100)
  const overage = Math.max(0, Math.round((paid - due) * 100) / 100)
  const isFullyPaid = remaining < 0.01 && overage < 0.01
  const isOverpaid = overage >= 0.01

  const quickCash = useMemo(() => {
    const rounded = Math.ceil(due / 5) * 5
    return [rounded, rounded + 10, rounded + 20, rounded + 50]
  }, [due])

  /** Whole SAR within +1, or first quick-cash (ceil to 5 SAR) — absorb into bill, no change. */
  const cashRoundOff = useMemo(() => {
    if (cashValue <= due) return 0
    const delta = Math.round((cashValue - due) * 100) / 100
    if (delta <= 0) return 0
    const nearestFive = Math.ceil(due / 5) * 5
    const wholeSar = Number.isInteger(cashValue) && delta <= 0.999
    const quickRound = Math.abs(cashValue - nearestFive) < 0.001 && delta < 5
    return wholeSar || quickRound ? delta : 0
  }, [cashValue, due])

  const subTypes =
    parentPick != null ? payTypes.filter((p) => p.parent === parentPick) : []

  const isCash = method === 'Cash' || String(method ?? '').toLowerCase() === 'cash'

  function loyaltyPayload() {
    return {
      customerId: customerId || undefined,
      loyaltyRedeemPts: redeemPtsNum || undefined,
      loyaltyRedeemSar: redeemSar || undefined,
      giftCardId: pendingGift?.giftCardId,
      giftCardNumber: pendingGift?.giftCardNumber,
      giftCardAmount: pendingGift?.amount,
      foodVoucherId: pendingVoucher?.voucherId,
      foodVoucherCode: pendingVoucher?.voucherCode,
      foodVoucherAmount: pendingVoucher?.amount,
    }
  }

  async function runSoftPos(
    methodName: string,
    amountSar: number,
  ): Promise<{ ok: true; authCode: string; rrn: string } | { ok: false }> {
    if (!methodNeedsCardTerminal(methodName, payTypes)) {
      return { ok: true, authCode: '', rrn: '' }
    }
    setCardBusy(true)
    setCardError('')
    try {
      const result = await requestCardPayment({
        amountSar: Math.round(amountSar * 100) / 100,
        currency: 'SAR',
        reference: `SET-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      })
      if (!result.ok) {
        setCardError(result.reason || t.softposSettleFail)
        return { ok: false }
      }
      return { ok: true, authCode: result.authCode, rrn: result.rrn }
    } catch (err) {
      setCardError(err instanceof Error ? err.message : t.softposSettleFail)
      return { ok: false }
    } finally {
      setCardBusy(false)
    }
  }

  function appendDigit(d: string) {
    if (d === 'X') {
      setTendered((v) => v.slice(0, -1))
      return
    }
    if (d === '.' && tendered.includes('.')) return
    setTendered((v) => `${v}${d}`)
  }

  async function addPayment() {
    if (cardBusy) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    if (remaining < 0.01) return
    const nextAmount = Math.min(amount, remaining)
    if (nextAmount <= 0) return
    const soft = await runSoftPos(payMethod, nextAmount)
    if (!soft.ok) return
    const label =
      soft.authCode && methodNeedsCardTerminal(payMethod, payTypes)
        ? `${payMethod} · ${soft.authCode}`
        : payMethod
    setPayments((prev) => [
      ...prev,
      {
        method: label,
        amount: Math.round(nextAmount * 100) / 100,
        cardAuthCode: soft.authCode || undefined,
        cardRrn: soft.rrn || undefined,
      },
    ])
    setPayAmount('')
  }

  async function addEqualSlice(methodName: string) {
    if (cardBusy) return
    if (remaining < 0.01) return
    const amount = Math.round(remaining * 100) / 100
    const soft = await runSoftPos(methodName, amount)
    if (!soft.ok) return
    const label =
      soft.authCode && methodNeedsCardTerminal(methodName, payTypes)
        ? `${methodName} · ${soft.authCode}`
        : methodName
    setPayments((prev) => [
      ...prev,
      {
        method: label,
        amount,
        cardAuthCode: soft.authCode || undefined,
        cardRrn: soft.rrn || undefined,
      },
    ])
  }

  function fillRemainingAmount() {
    if (remaining < 0.01) return
    setPayAmount(String(Math.round(remaining * 100) / 100))
  }

  function fillHalfRemaining() {
    if (remaining < 0.01) return
    setPayAmount(String(Math.round((remaining / 2) * 100) / 100))
  }

  function removePayment(idx: number) {
    setPayments((prev) => prev.filter((_, i) => i !== idx))
  }

  function applyEqualParts() {
    const each = Math.round((due / parts) * 100) / 100
    const rows: SplitPayment[] = Array.from({ length: parts }, (_, i) => ({
      method: String(singleMethods[0]),
      amount: i === parts - 1 ? Math.round((due - each * (parts - 1)) * 100) / 100 : each,
    }))
    setPayments(rows)
    setSplitMode('custom')
  }

  async function confirm() {
    if (!method || cardBusy) return
    const loyalty = loyaltyPayload()
    const withVoucher = (base: string) =>
      pendingVoucher ? `${base} · Food voucher ${pendingVoucher.voucherCode}` : base
    if (isCash) {
      if (cashValue < due) return
      const useRoundOff = cashRoundOff > 0
      onConfirm({
        method: withVoucher('Cash'),
        tendered: cashValue,
        change: useRoundOff ? 0 : Math.max(0, change),
        roundOff: useRoundOff ? cashRoundOff : undefined,
        ...loyalty,
      })
      return
    }
    if (method === 'Split bill') {
      if (splitMode === 'equal') {
        onConfirm({
          method: withVoucher(`Split ×${parts}`),
          splitParts: parts,
          splitPayments: Array.from({ length: parts }, () => ({
            method: 'equal share',
            amount: Math.round(perPart * 100) / 100,
          })),
          ...loyalty,
        })
        return
      }
      if (!isFullyPaid || payments.length === 0) return
      const label = payments.map((p) => `${p.method} ${money(p.amount)}`).join(' + ')
      onConfirm({
        method: withVoucher(`Split · ${label}`),
        splitParts: payments.length,
        splitPayments: payments,
        ...loyalty,
      })
      return
    }

    if (methodNeedsCardTerminal(String(method), payTypes)) {
      const soft = await runSoftPos(String(method), due)
      if (!soft.ok) return
      onConfirm({
        method: withVoucher(
          soft.authCode ? `${method} · ${soft.authCode}` : String(method),
        ),
        cardAuthCode: soft.authCode || undefined,
        cardRrn: soft.rrn || undefined,
        ...loyalty,
      })
      return
    }

    onConfirm({ method: withVoucher(String(method)), ...loyalty })
  }

  function confirmGift(result: GiftCardPayResult) {
    const custId = result.customerId || customerId || undefined
    if (custId) setCustomerId(custId)
    if (result.amount + 0.001 >= due) {
      onConfirm({
        method: 'Customer Account',
        customerId: custId,
        giftCardId: result.giftCardId,
        giftCardNumber: result.giftCardNumber,
        giftCardAmount: result.amount,
        loyaltyRedeemPts: redeemPtsNum || undefined,
        loyaltyRedeemSar: redeemSar || undefined,
        foodVoucherId: pendingVoucher?.voucherId,
        foodVoucherCode: pendingVoucher?.voucherCode,
        foodVoucherAmount: pendingVoucher?.amount,
      })
      return
    }
    setPendingGift(result)
    setShowGiftPay(false)
    setMethod('Split bill')
    setSplitMode('custom')
    setPayments([
      {
        method: `Gift card ${result.giftCardNumber}`,
        amount: result.amount,
      },
    ])
  }

  function confirmFoodVoucher(result: FoodVoucherPayResult) {
    setShowFoodVoucher(false)
    setPendingVoucher(result)
    setPayments((prev) => prev.filter((p) => !/^Food voucher/i.test(p.method)))
    setTendered('')
    const nextDue = Math.max(
      0,
      Math.round(
        (computeDue
          ? computeDue(result.amount, redeemSar)
          : total - redeemSar - result.amount) * 100,
      ) / 100,
    )
    // Voucher covers the full bill after tax recalculation.
    if (nextDue < 0.01) {
      onConfirm({
        method: 'Food Voucher',
        customerId: customerId || undefined,
        loyaltyRedeemPts: redeemPtsNum || undefined,
        loyaltyRedeemSar: redeemSar || undefined,
        foodVoucherId: result.voucherId,
        foodVoucherCode: result.voucherCode,
        foodVoucherAmount: result.amount,
        giftCardId: pendingGift?.giftCardId,
        giftCardNumber: pendingGift?.giftCardNumber,
        giftCardAmount: pendingGift?.amount,
      })
    }
  }

  const loyaltyBlock =
    customers.length > 0 ? (
      <div className="settle-loyalty">
        <label className="field-label">{t.settleLoyaltyCustomer}</label>
        <MesaSelect
          value={customerId}
          onChange={(v) => {
            setCustomerId(v)
            setRedeemPts('')
            setPayments([])
            setTendered('')
          }}
          options={[
            { value: '', label: t.settleWalkInCustomer },
            ...customers.map((c) => ({
              value: c.id,
              label: `${c.name} · ${c.points} ${t.settlePts}`,
            })),
          ]}
        />
        {customer ? (
          <>
            <label className="field-label">
              {t.settleRedeemPts
                .replace('{rate}', money(SAR_PER_POINT))
                .replace('{max}', String(customer.points))}
            </label>
            <input
              className="search"
              inputMode="numeric"
              value={redeemPts}
              onChange={(e) => {
                setRedeemPts(e.target.value)
                setPayments([])
                setTendered('')
              }}
              placeholder="0"
            />
            {redeemSar > 0 ? (
              <p className="modal-lead">
                {t.settleRedeemSummary
                  .replace('{pts}', String(redeemPtsNum))
                  .replace('{amount}', money(redeemSar))
                  .replace('{due}', money(due))}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null

  return createPortal(
    <div className="modal-backdrop cz-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card settle-card settle-card-wide">
        <div className="dine-pick-head settle-head">
          <div>
            <h2>{t.settleTitle.replace('{title}', title)}</h2>
            <p className="modal-lead">
              {t.settleAmountDue} <strong>{money(due)}</strong>
              <span className="settle-vat">{t.settleInclVat}</span>
              {redeemSar > 0
                ? ` ${t.settleAfterLoyalty.replace('{amount}', money(redeemSar))}`
                : ''}
              {voucherSar > 0 ? (
                <span className="settle-voucher-note">
                  {' '}
                  {t.settleAfterVoucher.replace('{amount}', money(voucherSar))}
                </span>
              ) : null}
            </p>
            {cardBusy ? (
              <p className="settle-card-busy" role="status">
                {t.softposSettleWaiting}
              </p>
            ) : null}
            {cardError ? (
              <p className="settle-card-error" role="alert">
                {cardError}
              </p>
            ) : null}
            {pendingVoucher ? (
              <div className="settle-voucher-chip" role="status">
                <span className="settle-voucher-chip-label">{t.settleVoucherApplied}</span>
                <strong>
                  {pendingVoucher.voucherCode} · {pendingVoucher.voucherName} ·{' '}
                  {money(pendingVoucher.amount)}
                </strong>
                <button
                  type="button"
                  className="settle-voucher-chip-clear"
                  onClick={() => {
                    setPendingVoucher(null)
                    setPayments((prev) => prev.filter((p) => !/^Food voucher/i.test(p.method)))
                    setTendered('')
                  }}
                >
                  {t.settleRemove}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="dine-ticket-close" onClick={onClose} aria-label={t.close}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {showFoodVoucher ? (
          <FoodVoucherPayModal
            embedded
            billAmount={Math.max(0, total - redeemSar)}
            onClose={() => setShowFoodVoucher(false)}
            onConfirm={confirmFoodVoucher}
          />
        ) : null}

        {showGiftPay ? (
          <GiftCardPayModal
            embedded
            billAmount={due}
            prefillCustomerName={customer?.name}
            prefillPhone={customer?.phone}
            onClose={() => setShowGiftPay(false)}
            onConfirm={confirmGift}
          />
        ) : null}

        {!method && !parentPick && !showFoodVoucher && !showGiftPay ? (
          <>
            {loyaltyBlock}
            <div className="method-grid settle-parent-grid">
              {paymentParents
                // Food vouchers have their own button below — avoid a second "Voucher" that does the same thing.
                .filter((p) => p.id !== 'voucher')
                .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const kids = payTypes.filter((x) => x.parent === p.id)
                    if (p.id === 'cash' || kids.length <= 1) {
                      setMethod(kids[0]?.name ?? 'Cash')
                      setParentPick(null)
                      setTendered(String(due))
                      return
                    }
                    setParentPick(p.id)
                  }}
                >
                  {parentPayLabel(p.id, t)}
                </button>
              ))}
              <button
                type="button"
                className={
                  voucherSar > 0
                    ? 'btn btn-teal settle-method-applied'
                    : 'btn btn-secondary'
                }
                aria-pressed={voucherSar > 0}
                onClick={() => {
                  setParentPick(null)
                  setShowFoodVoucher(true)
                }}
              >
                {voucherSar > 0
                  ? t.settleFoodVoucherAmt.replace('{amount}', money(voucherSar))
                  : t.settleFoodVoucher}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setParentPick(null)
                  setShowGiftPay(true)
                }}
              >
                {t.settleCustomerAccount}
              </button>
              <button
                type="button"
                className="btn btn-teal"
                onClick={() => {
                  setMethod('Split bill')
                  setParentPick(null)
                  setPayments([])
                  setSplitMode('equal')
                }}
              >
                {t.settleSplitBill}
              </button>
            </div>
          </>
        ) : null}

        {!method && parentPick ? (
          <div className="settle-detail">
            <button type="button" className="settle-back" onClick={() => setParentPick(null)}>
              {t.settleBack}
            </button>
            <p className="modal-lead">
              {t.settleSubPayment.replace('{label}', parentPayLabel(parentPick, t))}
            </p>
            <div className="method-grid settle-parent-grid">
              {subTypes.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (/customer|gift/i.test(row.name)) {
                      setShowGiftPay(true)
                      setParentPick(null)
                      return
                    }
                    if (/food\s*voucher|voucher/i.test(row.name)) {
                      setShowFoodVoucher(true)
                      setParentPick(null)
                      return
                    }
                    setMethod(row.name)
                    setParentPick(null)
                    if (row.parent === 'cash') setTendered(String(due))
                  }}
                >
                  {row.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {method && isCash ? (
          <div className="settle-detail settle-cash-layout">
            <button type="button" className="settle-back" onClick={() => setMethod(null)}>
              {t.settleBack}
            </button>
            <div className="settle-cash-head">
              <strong>
                {t.total} {money(due)}
              </strong>
              <span>{t.settleCharged.replace('{amount}', money(cashValue))}</span>
            </div>
            <div className="settle-cash-grid">
              <div className="settle-denoms">
                {quickDenoms.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTendered(String((Number(tendered) || 0) + n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="settle-keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'X'].map((k) => (
                  <button key={k} type="button" onClick={() => appendDigit(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <div className="settle-cash-quick">
                <button type="button" onClick={() => setTendered(String(due))}>
                  {t.all}
                </button>
                <button
                  type="button"
                  onClick={() => setTendered(String(Math.round((due / 2) * 100) / 100))}
                >
                  {t.settleHalf}
                </button>
                {quickCash.map((n) => (
                  <button key={n} type="button" onClick={() => setTendered(String(n))}>
                    {money(n)}
                  </button>
                ))}
              </div>
            </div>
            <p className="modal-lead">
              {t.settleTendered} {money(cashValue)} ·{' '}
              {cashRoundOff > 0 ? (
                <>
                  {t.settleRoundOff} <strong>{money(cashRoundOff)}</strong> · {t.settleBill}{' '}
                  <strong>{money(cashValue)}</strong>
                </>
              ) : (
                <>
                  {t.settleChange} <strong>{money(Math.max(0, change))}</strong>
                </>
              )}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cashValue < due || cardBusy}
              onClick={() => void confirm()}
            >
              {t.settleConfirmCash}
            </button>
          </div>
        ) : null}

        {method && !isCash && method !== 'Split bill' ? (
          <div className="settle-detail">
            <button
              type="button"
              className="settle-back"
              disabled={cardBusy}
              onClick={() => {
                setMethod(null)
                setCardError('')
              }}
            >
              {t.settleBack}
            </button>
            <p className="modal-lead">
              {t.settlePayWith.replace('{amount}', money(due)).replace('{method}', method)}
            </p>
            {methodNeedsCardTerminal(String(method), payTypes) ? (
              <p className="modal-lead settle-softpos-hint">{t.softposSettleHint}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={cardBusy}
              onClick={() => void confirm()}
            >
              {cardBusy
                ? t.softposSettleWaiting
                : t.settleConfirmMethod.replace('{method}', method)}
            </button>
          </div>
        ) : null}

        {method === 'Split bill' ? (
          <div className="settle-detail settle-split">
            <button type="button" className="settle-back" onClick={() => setMethod(null)}>
              {t.settleBack}
            </button>
            <div className="split-tabs">
              <button
                type="button"
                className={splitMode === 'equal' ? 'active' : ''}
                onClick={() => setSplitMode('equal')}
              >
                {t.settleEqual}
              </button>
              <button
                type="button"
                className={splitMode === 'custom' ? 'active' : ''}
                onClick={() => setSplitMode('custom')}
              >
                {t.settleCustom}
              </button>
            </div>
            {splitMode === 'equal' ? (
              <>
                <label className="field-label">{t.settleParts}</label>
                <div className="qty-controls">
                  <button type="button" onClick={() => setParts((p) => Math.max(2, p - 1))}>
                    -
                  </button>
                  <strong>{parts}</strong>
                  <button type="button" onClick={() => setParts((p) => Math.min(8, p + 1))}>
                    +
                  </button>
                </div>
                <p className="modal-lead">{t.settleEach.replace('{amount}', money(perPart))}</p>
                <button type="button" className="btn btn-ghost" onClick={applyEqualParts}>
                  {t.settleConvertCustom}
                </button>
                <button
                  type="button"
                  className="btn btn-teal settle-confirm"
                  disabled={cardBusy}
                  onClick={() => void confirm()}
                >
                  {t.settleConfirmEqual}
                </button>
              </>
            ) : (
              <>
                <div
                  className={`settle-remain${isOverpaid ? ' over' : isFullyPaid ? ' ok' : ''}`}
                  role={isOverpaid ? 'alert' : undefined}
                >
                  {isOverpaid ? (
                    <>
                      <span className="settle-remain-copy">
                        <span className="settle-over-badge">{t.settleExtra}</span>
                        {t.settleOverpaid}
                      </span>
                      <strong>{money(overage)}</strong>
                    </>
                  ) : isFullyPaid ? (
                    <>
                      <span>{t.settleFullyPaid}</span>
                      <strong>{money(due)}</strong>
                    </>
                  ) : (
                    <>
                      <span>{t.settleRemaining}</span>
                      <strong>{money(remaining)}</strong>
                    </>
                  )}
                </div>
                <p className="settle-split-summary">
                  {t.settlePaidOf
                    .replace('{paid}', money(paid))
                    .replace('{due}', money(due))}
                  {payments.length
                    ? ` · ${payments.length} ${
                        payments.length === 1 ? t.settlePaymentOne : t.settlePaymentMany
                      }`
                    : ''}
                </p>
                <div className="settle-split-rest">
                  {payTypes.slice(0, 6).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      disabled={remaining < 0.01 || cardBusy}
                      onClick={() => void addEqualSlice(row.name)}
                    >
                      {t.settleRestTo.replace('{name}', row.name)}
                    </button>
                  ))}
                </div>
                <div className="settle-split-fill">
                  <button
                    type="button"
                    disabled={remaining < 0.01 || cardBusy}
                    onClick={fillRemainingAmount}
                  >
                    {t.settleFillRemaining}
                  </button>
                  <button
                    type="button"
                    disabled={remaining < 0.01 || cardBusy}
                    onClick={fillHalfRemaining}
                  >
                    {t.settleHalfRemaining}
                  </button>
                </div>
                <div className="settle-split-add">
                  <MesaSelect
                    value={payMethod}
                    onChange={setPayMethod}
                    options={payTypes.map((row) => ({ value: row.name, label: row.name }))}
                  />
                  <input
                    className="search"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder={remaining > 0.009 ? String(remaining) : t.settleAmount}
                    disabled={remaining < 0.01 || cardBusy}
                    aria-label={t.settleAmount}
                  />
                  <button
                    type="button"
                    className="btn btn-teal"
                    disabled={remaining < 0.01 || cardBusy}
                    onClick={() => void addPayment()}
                  >
                    {cardBusy ? t.softposSettleWaiting : t.settleAdd}
                  </button>
                </div>
                {payments.length === 0 ? (
                  <p className="settle-split-hint">{t.settleSplitHint}</p>
                ) : (
                  <ul className="settle-pay-list">
                    {payments.map((p, i) => (
                      <li key={`${p.method}-${i}`}>
                        <span>
                          {p.method} · {money(p.amount)}
                        </span>
                        <button
                          type="button"
                          className="dine-void-btn"
                          disabled={cardBusy}
                          onClick={() => removePayment(i)}
                        >
                          {t.settleRemove}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="btn btn-teal settle-confirm"
                  disabled={!isFullyPaid || cardBusy}
                  onClick={() => void confirm()}
                >
                  {isOverpaid ? t.settleFixOverpay : t.settleConfirmSplit}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
