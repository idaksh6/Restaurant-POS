import { money, type OrderLine } from '../data/mock'
import { loadAllPrinters, receiptStation } from '../data/printers'
import { printEscPos, receiptSlipToJob } from '../hardware/printer'
import { bilingualName, localizedLineName } from '../lib/branding'
import { getZatcaInvoice } from '../hardware/zatca'
import { apiGetZatcaInvoice, apiZatcaReady } from '../lib/apiZatca'
import { messages, useI18n } from '../locale/i18n'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useEffect, useState } from 'react'

export type ReceiptData = {
  title: string
  method: string
  lines: OrderLine[]
  subtotal: number
  tax: number
  total: number
  discountAmt?: number
  charges?: { name: string; amount: number }[]
  loyaltyRedeem?: number
  splitParts?: number
  splitPayments?: { method: string; amount: number }[]
  tendered?: number
  change?: number
  staff?: string
  time: string
  customerName?: string
  /** paid = settled receipt · guest = print check · ebill = electronic bill */
  kind?: 'paid' | 'guest' | 'ebill'
  /** ZATCA Phase 1 QR (data URL) — only on settled receipts when enabled */
  zatcaQrDataUrl?: string
  invoiceUuid?: string
  zatcaPhase2Status?: 'local' | 'pending' | 'queued' | 'sandbox' | 'reported' | 'failed'
  zatcaPhase2Message?: string
}

type Props = {
  receipt: ReceiptData
  onClose: () => void
}

export default function ReceiptModal({ receipt, onClose }: Props) {
  const { flash } = usePos()
  const { dishes } = useMasters()
  const { t, lang, isRtl } = useI18n()
  const [phase2Status, setPhase2Status] = useState(receipt.zatcaPhase2Status)
  const [phase2Message, setPhase2Message] = useState(receipt.zatcaPhase2Message)
  const kind = receipt.kind ?? 'paid'
  const station = receiptStation(loadAllPrinters())

  useEffect(() => {
    setPhase2Status(receipt.zatcaPhase2Status)
    setPhase2Message(receipt.zatcaPhase2Message)
    const uuid = receipt.invoiceUuid
    if (!uuid || receipt.kind === 'guest' || receipt.kind === 'ebill') return
    const local = getZatcaInvoice(uuid)
    if (local?.phase2Status) setPhase2Status(local.phase2Status)
    if (local?.phase2Message) setPhase2Message(local.phase2Message)
    if (!apiZatcaReady()) return
    void apiGetZatcaInvoice(uuid)
      .then((remote) => {
        if (!remote?.status) return
        setPhase2Status(remote.status as typeof phase2Status)
        if (remote.message) setPhase2Message(remote.message)
      })
      .catch(() => undefined)
  }, [receipt.invoiceUuid, receipt.kind, receipt.zatcaPhase2Status, receipt.zatcaPhase2Message])

  const heading =
    kind === 'guest' ? t.printGuestBill : kind === 'ebill' ? t.printEbill : t.printReceipt
  const brand = station?.header?.trim() || 'MESA KSA · RIYADH'
  const paperMm = Math.max(48, Math.min(120, Number(station?.paperWidthMm) || 80))
  const templateId = station?.templateId
  const lineLabel = (line: OrderLine) => {
    const base =
      templateId === 'bilingual'
        ? (() => {
            const dish = dishes.find((d) => d.id === line.itemId)
            return dish ? bilingualName(dish) : line.name
          })()
        : localizedLineName(line, dishes, lang)
    return `${line.qty}× ${base}${line.note ? ` (${line.note})` : ''}`
  }
  const footerNote = (() => {
    const custom = station?.footer?.trim() || ''
    const thanksEn = messages('en').printThanks
    const thanksAr = messages('ar').printThanks
    const isDefault =
      !custom ||
      custom === thanksEn ||
      custom === thanksAr ||
      custom === 'Thank you — visit again' ||
      custom === 'شكراً لزيارتكم'
    if (kind === 'guest') return isDefault || !custom ? t.printGuestFooter : custom
    if (kind === 'ebill') return isDefault || !custom ? t.printEbillFooter : custom
    return isDefault ? t.printThanks : custom
  })()
  const vatLabel = t.vat
  const guestTag = kind === 'guest' ? t.printGuestTag : kind === 'ebill' ? t.printEbillTag : undefined

  function handlePrint() {
    const items = receipt.lines.map((line) => ({
      label: lineLabel(line),
      value: money(line.qty * line.price, lang),
    }))
    const totals: { label: string; value: string; strong?: boolean; muted?: boolean }[] = [
      { label: t.printGoods, value: money(receipt.subtotal, lang), muted: true },
    ]
    if (receipt.discountAmt && receipt.discountAmt > 0) {
      totals.push({ label: t.discount, value: `-${money(receipt.discountAmt, lang)}`, muted: true })
    }
    for (const c of receipt.charges ?? []) {
      totals.push({ label: c.name, value: money(c.amount, lang), muted: true })
    }
    totals.push({ label: vatLabel, value: money(receipt.tax, lang), muted: true })
    if (receipt.loyaltyRedeem && receipt.loyaltyRedeem > 0) {
      totals.push({
        label: t.printLoyaltyRedeem,
        value: `-${money(receipt.loyaltyRedeem, lang)}`,
        muted: true,
      })
    }
    totals.push({ label: t.total, value: money(receipt.total, lang), strong: true })
    if (kind === 'paid') {
      totals.push({ label: t.printPaidBy, value: receipt.method })
    } else {
      totals.push({ label: t.status, value: receipt.method })
    }
    if (receipt.splitPayments?.length) {
      receipt.splitPayments.forEach((p, i) => {
        totals.push({
          label: `${t.printSplit} ${i + 1} · ${p.method}`,
          value: money(p.amount, lang),
        })
      })
    } else if (receipt.splitParts) {
      totals.push({
        label: t.printSplit,
        value: `${receipt.splitParts} × ${money(receipt.total / receipt.splitParts, lang)}`,
      })
    }
    if (typeof receipt.tendered === 'number') {
      totals.push({ label: t.printTendered, value: money(receipt.tendered, lang) })
      totals.push({ label: t.printChange, value: money(receipt.change ?? 0, lang) })
    }

    void printEscPos(
      receiptSlipToJob({
        brand,
        meta: [
          receipt.title,
          `${receipt.time}${receipt.staff ? ` · ${receipt.staff}` : ''}${
            receipt.customerName ? ` · ${receipt.customerName}` : ''
          }`,
        ],
        tag: guestTag,
        items,
        totals,
        footer: footerNote,
        paperWidthMm: paperMm,
        templateId,
        type: kind === 'guest' ? 'temp-bill' : 'receipt',
        lang,
      }),
    ).then((res) => {
      if (!res.ok) {
        flash(t.printingBlocked, 'err')
      }
    })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="modal-card receipt-card">
        <div className="section-head">
          <h2>{heading}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.printDone}
          </button>
        </div>
        <div className="receipt-body" id="mesa-print-area">
          <strong className="receipt-brand">{brand}</strong>
          <p>{receipt.title}</p>
          <p>
            {receipt.time}
            {receipt.staff ? ` · ${receipt.staff}` : ''}
            {receipt.customerName ? ` · ${receipt.customerName}` : ''}
          </p>
          {kind !== 'paid' && guestTag ? <p className="receipt-kind-tag">{guestTag}</p> : null}
          <hr />
          {receipt.lines.map((line) => (
            <div key={line.id} className="receipt-line">
              <span>{lineLabel(line)}</span>
              <span>{money(line.qty * line.price, lang)}</span>
            </div>
          ))}
          <hr />
          <div className="receipt-line">
            <span>{t.printGoods}</span>
            <span>{money(receipt.subtotal, lang)}</span>
          </div>
          {receipt.discountAmt && receipt.discountAmt > 0 ? (
            <div className="receipt-line">
              <span>{t.discount}</span>
              <span>-{money(receipt.discountAmt, lang)}</span>
            </div>
          ) : null}
          {receipt.charges?.map((c) => (
            <div key={c.name} className="receipt-line">
              <span>{c.name}</span>
              <span>{money(c.amount, lang)}</span>
            </div>
          ))}
          <div className="receipt-line">
            <span>{vatLabel}</span>
            <span>{money(receipt.tax, lang)}</span>
          </div>
          {receipt.loyaltyRedeem && receipt.loyaltyRedeem > 0 ? (
            <div className="receipt-line">
              <span>{t.printLoyaltyRedeem}</span>
              <span>-{money(receipt.loyaltyRedeem, lang)}</span>
            </div>
          ) : null}
          <div className="receipt-line total">
            <span>{t.total}</span>
            <span>{money(receipt.total, lang)}</span>
          </div>
          {kind === 'paid' ? (
            <div className="receipt-line">
              <span>{t.printPaidBy}</span>
              <span>{receipt.method}</span>
            </div>
          ) : (
            <div className="receipt-line">
              <span>{t.status}</span>
              <span>{receipt.method}</span>
            </div>
          )}
          {receipt.splitPayments?.length ? (
            <>
              {receipt.splitPayments.map((p, i) => (
                <div key={`${p.method}-${i}`} className="receipt-line">
                  <span>
                    {t.printSplit} {i + 1} · {p.method}
                  </span>
                  <span>{money(p.amount, lang)}</span>
                </div>
              ))}
            </>
          ) : receipt.splitParts ? (
            <div className="receipt-line">
              <span>{t.printSplit}</span>
              <span>
                {receipt.splitParts} × {money(receipt.total / receipt.splitParts, lang)}
              </span>
            </div>
          ) : null}
          {typeof receipt.tendered === 'number' ? (
            <>
              <div className="receipt-line">
                <span>{t.printTendered}</span>
                <span>{money(receipt.tendered, lang)}</span>
              </div>
              <div className="receipt-line">
                <span>{t.printChange}</span>
                <span>{money(receipt.change ?? 0, lang)}</span>
              </div>
            </>
          ) : null}
          {kind === 'paid' && receipt.zatcaQrDataUrl ? (
            <div className="receipt-zatca">
              <img src={receipt.zatcaQrDataUrl} alt="ZATCA e-invoice QR" width={120} height={120} />
              <span>ZATCA e-invoice</span>
              {receipt.invoiceUuid ? (
                <small className="mesa-ltr-nums">{receipt.invoiceUuid}</small>
              ) : null}
              {phase2Status && phase2Status !== 'local' ? (
                <small
                  className={`receipt-zatca-status mesa-ltr-nums st-${phase2Status}`}
                  title={phase2Message || undefined}
                >
                  {phase2Status === 'reported'
                    ? t.zatcaStatusReported
                    : phase2Status === 'sandbox'
                      ? t.zatcaStatusSandbox
                      : phase2Status === 'failed'
                        ? t.zatcaStatusFailed
                        : t.zatcaStatusPending}
                </small>
              ) : null}
            </div>
          ) : null}
          <p className="receipt-thanks">{footerNote}</p>
        </div>
        <div className="action-row">
          {(kind === 'guest' || kind === 'ebill' || kind === 'paid') && (
            <button type="button" className="btn btn-ghost" onClick={handlePrint}>
              {t.printAction}
            </button>
          )}
          <button type="button" className="btn btn-teal" onClick={onClose}>
            {t.printClose}
          </button>
        </div>
      </div>
    </div>
  )
}
