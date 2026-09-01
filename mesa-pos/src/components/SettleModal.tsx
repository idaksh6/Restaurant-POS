import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import GiftCardPayModal, { type GiftCardPayResult } from './GiftCardPayModal'
import MesaSelect from './MesaSelect'
import FoodVoucherPayModal, { type FoodVoucherPayResult } from './FoodVoucherPayModal'
import { money } from '../data/mock'
import { paymentParents, ensurePaymentTypes, type PaymentParent } from '../data/paymentTypes'
import { paymentMethods } from '../locale/saudi'
import { SAR_PER_POINT } from '../state/CrmContext'
import { useCatalog } from '../state/CatalogContext'

const singleMethods = paymentMethods.filter((m) => m !== 'Split bill')

export type SplitPayment = {
  method: string
  amount: number
}

export type SettleResult = {
  method: string
  splitParts?: number
  splitPayments?: SplitPayment[]
  tendered?: number
  change?: number
  customerId?: string
  loyaltyRedeemPts?: number
  loyaltyRedeemSar?: number
  giftCardId?: string
  giftCardNumber?: string
  giftCardAmount?: number
  foodVoucherId?: string
  foodVoucherCode?: string
  foodVoucherAmount?: number
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
  onClose: () => void
  onConfirm: (result: SettleResult) => void
}

type SplitMode = 'equal' | 'custom'

const quickDenoms = [5, 10, 20, 50, 100, 500]

export default function SettleModal({
  total,
  title,
  initialMethod = null,
  startInSplit = false,
  customers = [],
  preselectCustomerId,
  onClose,
  onConfirm,
}: Props) {
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

  const customer = customers.find((c) => c.id === customerId)
  const redeemPtsNum = Math.min(
    Math.max(0, Math.floor(Number(redeemPts) || 0)),
    customer?.points ?? 0,
  )
  const redeemSar = Math.round(redeemPtsNum * SAR_PER_POINT * 100) / 100
  const voucherSar = pendingVoucher?.amount ?? 0
  const due = Math.max(0, Math.round((total - redeemSar - voucherSar) * 100) / 100)

  const cashValue = Number(tendered) || 0
  const change = cashValue - due
  const perPart = due / parts

  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, Math.round((due - paid) * 100) / 100)
  const isFullyPaid = remaining < 0.01

  const quickCash = useMemo(() => {
    const rounded = Math.ceil(due / 5) * 5
    return [rounded, rounded + 10, rounded + 20, rounded + 50]
  }, [due])

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

  function appendDigit(d: string) {
    if (d === 'X') {
      setTendered((v) => v.slice(0, -1))
      return
    }
    if (d === '.' && tendered.includes('.')) return
    setTendered((v) => `${v}${d}`)
  }

  function addPayment() {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    const nextAmount = Math.min(amount, remaining || due)
    if (nextAmount <= 0) return
    setPayments((prev) => [...prev, { method: payMethod, amount: Math.round(nextAmount * 100) / 100 }])
    setPayAmount('')
  }

  function addEqualSlice(methodName: string) {
    if (remaining < 0.01) return
    setPayments((prev) => [...prev, { method: methodName, amount: Math.round(remaining * 100) / 100 }])
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

  function confirm() {
    if (!method) return
    const loyalty = loyaltyPayload()
    if (isCash) {
      if (cashValue < due) return
      onConfirm({ method: 'Cash', tendered: cashValue, change: Math.max(0, change), ...loyalty })
      return
    }
    if (method === 'Split bill') {
      if (splitMode === 'equal') {
        onConfirm({
          method: `Split ×${parts}`,
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
        method: `Split · ${label}`,
        splitParts: payments.length,
        splitPayments: payments,
        ...loyalty,
      })
      return
    }
    onConfirm({ method: String(method), ...loyalty })
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
    if (result.amount + 0.001 >= Math.max(0, total - redeemSar)) {
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
      return
    }
    setMethod('Split bill')
    setSplitMode('custom')
    setPayments((prev) => {
      const rest = prev.filter((p) => !/^Food voucher/i.test(p.method))
      return [...rest, { method: `Food voucher ${result.voucherCode}`, amount: result.amount }]
    })
  }

  const loyaltyBlock =
    customers.length > 0 ? (
      <div className="settle-loyalty">
        <label className="field-label">Loyalty customer (optional)</label>
        <MesaSelect
          value={customerId}
          onChange={(v) => {
            setCustomerId(v)
            setRedeemPts('')
            setPayments([])
            setTendered('')
          }}
          options={[
            { value: '', label: 'Walk-in / no customer' },
            ...customers.map((c) => ({ value: c.id, label: `${c.name} · ${c.points} pts` })),
          ]}
        />
        {customer ? (
          <>
            <label className="field-label">
              Redeem points (1 pt = {money(SAR_PER_POINT)}) · max {customer.points}
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
                Redeem {redeemPtsNum} pts → −{money(redeemSar)} · due {money(due)}
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
            <h2>Settle — {title}</h2>
            <p className="modal-lead">
              Amount due <strong>{money(due)}</strong>
              <span className="settle-vat">incl. VAT</span>
              {redeemSar > 0 ? ` · after ${money(redeemSar)} loyalty` : ''}
              {voucherSar > 0 ? ` · after ${money(voucherSar)} food voucher` : ''}
            </p>
          </div>
          <button type="button" className="dine-ticket-close" onClick={onClose} aria-label="Close">
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
              {paymentParents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (p.id === 'voucher') {
                      setShowFoodVoucher(true)
                      setParentPick(null)
                      return
                    }
                    const kids = payTypes.filter((t) => t.parent === p.id)
                    if (p.id === 'cash' || kids.length <= 1) {
                      setMethod(kids[0]?.name ?? 'Cash')
                      setParentPick(null)
                      setTendered(String(due))
                      return
                    }
                    setParentPick(p.id)
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setParentPick(null)
                  setShowFoodVoucher(true)
                }}
              >
                Food Voucher
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setParentPick(null)
                  setShowGiftPay(true)
                }}
              >
                Customer Account
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
                Split bill
              </button>
            </div>
          </>
        ) : null}

        {!method && parentPick ? (
          <div className="settle-detail">
            <button type="button" className="settle-back" onClick={() => setParentPick(null)}>
              ← Back
            </button>
            <p className="modal-lead">
              Sub payment · {paymentParents.find((p) => p.id === parentPick)?.label}
            </p>
            <div className="method-grid settle-parent-grid">
              {subTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (/customer|gift/i.test(t.name)) {
                      setShowGiftPay(true)
                      setParentPick(null)
                      return
                    }
                    if (/food\s*voucher|voucher/i.test(t.name)) {
                      setShowFoodVoucher(true)
                      setParentPick(null)
                      return
                    }
                    setMethod(t.name)
                    setParentPick(null)
                    if (t.parent === 'cash') setTendered(String(due))
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {method && isCash ? (
          <div className="settle-detail settle-cash-layout">
            <button type="button" className="settle-back" onClick={() => setMethod(null)}>
              ← Back
            </button>
            <div className="settle-cash-head">
              <strong>Total {money(due)}</strong>
              <span>Charged {money(cashValue)}</span>
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
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTendered(String(Math.round((due / 2) * 100) / 100))}
                >
                  Half
                </button>
                {quickCash.map((n) => (
                  <button key={n} type="button" onClick={() => setTendered(String(n))}>
                    {money(n)}
                  </button>
                ))}
              </div>
            </div>
            <p className="modal-lead">
              Tendered {money(cashValue)} · Change <strong>{money(Math.max(0, change))}</strong>
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cashValue < due}
              onClick={confirm}
            >
              Confirm cash
            </button>
          </div>
        ) : null}

        {method && !isCash && method !== 'Split bill' ? (
          <div className="settle-detail">
            <button type="button" className="settle-back" onClick={() => setMethod(null)}>
              ← Back
            </button>
            <p className="modal-lead">
              Pay {money(due)} with <strong>{method}</strong>
            </p>
            <button type="button" className="btn btn-primary" onClick={confirm}>
              Confirm {method}
            </button>
          </div>
        ) : null}

        {method === 'Split bill' ? (
          <div className="settle-detail settle-split">
            <button type="button" className="settle-back" onClick={() => setMethod(null)}>
              ← Back
            </button>
            <div className="split-tabs">
              <button
                type="button"
                className={splitMode === 'equal' ? 'active' : ''}
                onClick={() => setSplitMode('equal')}
              >
                Equal
              </button>
              <button
                type="button"
                className={splitMode === 'custom' ? 'active' : ''}
                onClick={() => setSplitMode('custom')}
              >
                Custom
              </button>
            </div>
            {splitMode === 'equal' ? (
              <>
                <label className="field-label">Parts</label>
                <div className="qty-controls">
                  <button type="button" onClick={() => setParts((p) => Math.max(2, p - 1))}>
                    -
                  </button>
                  <strong>{parts}</strong>
                  <button type="button" onClick={() => setParts((p) => Math.min(8, p + 1))}>
                    +
                  </button>
                </div>
                <p className="modal-lead">≈ {money(perPart)} each</p>
                <button type="button" className="btn btn-ghost" onClick={applyEqualParts}>
                  Convert to custom lines
                </button>
                <button type="button" className="btn btn-teal settle-confirm" onClick={confirm}>
                  Confirm equal split
                </button>
              </>
            ) : (
              <>
                <div className={`settle-remain${remaining > 0.009 ? '' : ' ok'}`}>
                  <span>Remaining</span>
                  <strong>{money(remaining)}</strong>
                </div>
                <div className="settle-split-rest">
                  {payTypes.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => addEqualSlice(t.name)}
                    >
                      Rest → {t.name}
                    </button>
                  ))}
                </div>
                <div className="settle-split-add">
                  <MesaSelect
                    value={payMethod}
                    onChange={setPayMethod}
                    options={payTypes.map((t) => ({ value: t.name, label: t.name }))}
                  />
                  <input
                    className="search"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Amount"
                  />
                  <button type="button" className="btn btn-teal" onClick={addPayment}>
                    Add
                  </button>
                </div>
                <ul className="settle-pay-list">
                  {payments.map((p, i) => (
                    <li key={`${p.method}-${i}`}>
                      <span>
                        {p.method} · {money(p.amount)}
                      </span>
                      <button type="button" className="dine-void-btn" onClick={() => removePayment(i)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-teal settle-confirm"
                  disabled={!isFullyPaid}
                  onClick={confirm}
                >
                  Confirm split
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
