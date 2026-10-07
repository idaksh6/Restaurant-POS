import { money, type OrderLine, type OrderType } from '../data/mock'
import { loadCompanyProfile } from '../data/company'
import { loadAllPrinters, routePrinter } from '../data/printers'
import { areaIdByName } from '../data/tableAreas'
import { taxBreakdownForOrder, vatRateLabel } from '../data/tax'
import { printEscPos, receiptSlipToJob } from '../hardware/printer'
import { bilingualNameParts, companyDisplayName, findDishForLine, localizedLineName, resolveLineArabic } from '../lib/branding'
import { lineNameWithoutOptions } from '../lib/orderLineOptions'
import {
  getZatcaInvoice,
  hydrateZatcaFromRemote,
  isDenseZatcaQr,
  peekZatcaPhase2Config,
} from '../hardware/zatca'
import { apiZatcaReady } from '../lib/apiZatca'
import { messages, useI18n } from '../locale/i18n'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useEffect, useMemo, useRef, useState } from 'react'

/** Line rate/total — number only (no SAR); summary rows still use money(). */
function moneyPlain(n: number, lang: 'en' | 'ar') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export type ReceiptData = {
  title: string
  method: string
  lines: OrderLine[]
  subtotal: number
  tax: number
  total: number
  discountAmt?: number
  /** Percent discount used when settling (helps rebuild VAT split). */
  discountPct?: number
  charges?: { name: string; amount: number }[]
  loyaltyRedeem?: number
  foodVoucherAmt?: number
  foodVoucherCode?: string
  splitParts?: number
  splitPayments?: { method: string; amount: number }[]
  tendered?: number
  change?: number
  staff?: string
  /** Login username when available (printed as User) */
  staffUsername?: string
  time: string
  customerName?: string
  /** Sequential bill number (branch-scoped) */
  billNo?: number
  /** Ticket / order identifier shown on the invoice */
  orderId?: string
  /** Table label when dine-in (e.g. "Table 01") */
  tableLabel?: string
  /** paid = settled receipt · guest = print check · ebill = electronic bill */
  kind?: 'paid' | 'guest' | 'ebill'
  /** ZATCA Phase 1 QR (data URL) — only on settled receipts when enabled */
  zatcaQrDataUrl?: string
  invoiceUuid?: string
  zatcaPhase2Status?: 'local' | 'pending' | 'queued' | 'sandbox' | 'reported' | 'failed'
  zatcaPhase2Message?: string
  /** Printer routing (Settings → Printers → Assignment) */
  orderType?: OrderType
  /** Floor area name of the table (dine-in) */
  tableArea?: string
}

type Props = {
  receipt: ReceiptData
  onClose: () => void
  /** History / ledger view — no auto-print and no cash drawer */
  reprint?: boolean
}

export default function ReceiptModal({ receipt, onClose, reprint = false }: Props) {
  const { flash } = usePos()
  const { dishes } = useMasters()
  const { taxes } = useCatalog()
  const { company, branches, activeBranchId } = useBranch()
  const { t, lang, isRtl } = useI18n()
  const [phase2Status, setPhase2Status] = useState(receipt.zatcaPhase2Status)
  const [phase2Message, setPhase2Message] = useState(receipt.zatcaPhase2Message)
  /** QR shown/printed: starts as Phase 1 TLV, swapped for the Phase 2 stamped QR when Fatoora answers */
  const [qrDataUrl, setQrDataUrl] = useState(receipt.zatcaQrDataUrl)
  /** True while the Phase 2 report is in flight (Phase 1 QR must not be shown/printed yet) */
  const [qrWaiting, setQrWaiting] = useState(false)
  /** Phase 2 QR (tags 1–9) is ~90 modules — render it larger so phones can read it */
  const [qrDense, setQrDense] = useState(false)
  const kind = receipt.kind ?? 'paid'
  const station = useMemo(
    () =>
      routePrinter(loadAllPrinters(), kind === 'guest' ? 'bill' : 'receipt', {
        orderType: receipt.orderType,
        areaId: areaIdByName(receipt.tableArea),
      }),
    [kind, receipt.orderType, receipt.tableArea],
  )
  const slipOpts = station?.options
  const autoPrinted = useRef(false)
  const [printState, setPrintState] = useState<
    { phase: 'idle' } | { phase: 'printing' } | { phase: 'done'; printer?: string; dialog: boolean; at: Date; count: number } | { phase: 'failed'; queued: boolean }
  >({ phase: 'idle' })
  const printCount = useRef(0)

  const vatRows = useMemo(() => {
    if (company.enableTax === false || !(receipt.tax > 0)) return []
    const goods = receipt.lines.reduce((s, l) => s + l.qty * l.price, 0)
    const discountPct =
      typeof receipt.discountPct === 'number'
        ? receipt.discountPct
        : goods > 0 && (receipt.discountAmt ?? 0) > 0
          ? ((receipt.discountAmt ?? 0) / goods) * 100
          : 0
    const rows = taxBreakdownForOrder({
      lines: receipt.lines,
      dishes,
      taxes,
      discountPct,
      charges: (receipt.charges ?? []).map((c, i) => ({
        id: `c-${i}`,
        name: c.name,
        amount: c.amount,
      })),
      extraDiscountAmt: receipt.foodVoucherAmt,
      enableTax: true,
    })
    if (rows.length) return rows
    // Fallback: single line matching receipt.tax
    return [{ percent: 15, tax: receipt.tax, items: [] as string[] }]
  }, [
    company.enableTax,
    receipt.tax,
    receipt.lines,
    receipt.discountPct,
    receipt.discountAmt,
    receipt.charges,
    receipt.foodVoucherAmt,
    dishes,
    taxes,
  ])

  useEffect(() => {
    setPhase2Status(receipt.zatcaPhase2Status)
    setPhase2Message(receipt.zatcaPhase2Message)
    setQrDataUrl(receipt.zatcaQrDataUrl)
    const uuid = receipt.invoiceUuid
    if (!uuid || receipt.kind === 'guest' || receipt.kind === 'ebill') return

    const isFinal = (s?: string) => s === 'sandbox' || s === 'reported' || s === 'failed'
    // The Phase 2 report runs in the background right after settle. Poll the
    // local ZATCA store so the receipt picks up the stamped QR (tags 1–9) and
    // the final status instead of freezing on the Phase 1 QR + "Reporting…".
    const syncLocal = (): boolean => {
      const local = getZatcaInvoice(uuid)
      if (!local) return false
      if (local.phase2Status) setPhase2Status(local.phase2Status)
      if (local.phase2Message) setPhase2Message(local.phase2Message)
      if (local.qrDataUrl) setQrDataUrl(local.qrDataUrl)
      setQrDense(isDenseZatcaQr(local.tlvBase64))
      return isFinal(local.phase2Status)
    }
    if (syncLocal()) {
      setQrWaiting(false)
      return
    }

    // While Phase 2 is on and the report is in flight, hide the Phase 1 QR and
    // hold printing — a Phase 1 QR scanned/printed in this window is exactly
    // what the ZATCA app flags as "not compatible with Phase 2". Give up
    // waiting after 12s and show whatever QR we have.
    const phase2On = peekZatcaPhase2Config()?.phase2Enabled === true
    const local = getZatcaInvoice(uuid)
    const initial = local?.phase2Status ?? receipt.zatcaPhase2Status
    // Reprint after a reload: nothing cached locally yet — hold the QR until the
    // server copy (with the reported Phase 2 QR) arrives instead of showing Phase 1.
    const noLocalCopy = !local && !receipt.zatcaQrDataUrl
    const waiting =
      noLocalCopy || (phase2On && (initial === 'pending' || initial === 'queued' || initial === 'local'))
    setQrWaiting(waiting)
    const WAIT_MAX_TICKS = 12

    let ticks = 0
    const timer = window.setInterval(() => {
      ticks += 1
      const done = syncLocal()
      if (done || ticks >= WAIT_MAX_TICKS) setQrWaiting(false)
      if (done || ticks >= 60) window.clearInterval(timer)
    }, 1000)

    if (apiZatcaReady()) {
      void hydrateZatcaFromRemote(uuid)
        .then((row) => {
          if (!row) return
          if (row.phase2Status) setPhase2Status(row.phase2Status)
          if (row.phase2Message) setPhase2Message(row.phase2Message)
          if (row.qrDataUrl) setQrDataUrl(row.qrDataUrl)
          setQrDense(isDenseZatcaQr(row.tlvBase64))
          if (isFinal(row.phase2Status) || noLocalCopy) setQrWaiting(false)
        })
        .catch(() => undefined)
    }
    return () => window.clearInterval(timer)
  }, [
    receipt.invoiceUuid,
    receipt.kind,
    receipt.zatcaPhase2Status,
    receipt.zatcaPhase2Message,
    receipt.zatcaQrDataUrl,
  ])

  const heading =
    kind === 'guest' ? t.printGuestBill : kind === 'ebill' ? t.printEbill : t.printReceipt
  const profile = company?.companyName ? company : loadCompanyProfile()
  const branch =
    branches.find((b) => b.id === activeBranchId) ||
    branches.find((b) => b.active) ||
    branches[0]
  const companyBrand = companyDisplayName(profile, lang)
  /** Prefer live company name; printer station header is optional override only if non-placeholder. */
  const stationHeader = station?.header?.trim() || ''
  const isPlaceholderHeader =
    !stationHeader ||
    /^mesa(\s+ksa)?/i.test(stationHeader) ||
    stationHeader.toUpperCase() === 'MESA KSA · RIYADH' ||
    stationHeader.toUpperCase() === 'MESA KSA • RIYADH'
  /** Customer slip: company name only — never append branch (e.g. Head Office). */
  const brand = isPlaceholderHeader ? companyBrand : stationHeader
  const companyAlias =
    lang === 'ar' ? profile.companyName?.trim() : profile.aliasName?.trim()
  const showAlias =
    Boolean(companyAlias) &&
    companyAlias!.toLowerCase() !== companyBrand.toLowerCase() &&
    !brand.toLowerCase().includes(companyAlias!.toLowerCase())
  const addressLine =
    lang === 'ar'
      ? branch?.addressAr?.trim() || branch?.address?.trim() || ''
      : branch?.address?.trim() || branch?.addressAr?.trim() || ''
  const phoneLine = (branch?.phone?.trim() || profile.hqPhone?.trim() || '').trim()
  const vatNo = String(profile.taxId || '').replace(/\D/g, '')
  const companyHeaderLines = [
    showAlias && (kind === 'paid' || slipOpts?.printName !== false) ? companyAlias! : '',
    slipOpts?.printAddress !== false ? addressLine : '',
    phoneLine && slipOpts?.printPhone !== false ? `${t.printContactNo}: ${phoneLine}` : '',
    // VAT number is mandatory on a paid tax invoice — the printer toggle only applies to bills
    vatNo && (kind === 'paid' || slipOpts?.printVat !== false) ? `${t.printVatNo}: ${vatNo}` : '',
  ].filter(Boolean)
  const paperMm = Math.max(48, Math.min(120, Number(station?.paperWidthMm) || 80))
  const templateId = station?.templateId
  const lineItemParts = (line: OrderLine) => {
    const dish = findDishForLine(line, dishes)
    const enRaw = localizedLineName(line, dishes, 'en')
    const enBase = lineNameWithoutOptions(enRaw, line.note)
    const note = line.note?.trim()
    const en = note ? `${enBase} (${note})` : enBase
    const arFromLine = resolveLineArabic(line, dishes)
    const ar =
      arFromLine ||
      (dish ? bilingualNameParts({ name: dish.name, alias: dish.alias }).ar : '')
    return { en, ar: ar && ar !== enBase && ar !== en ? ar : '' }
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
  /** Seller name is mandatory on a paid tax invoice — "print name" only applies to bills. */
  const slipBrand = kind !== 'paid' && slipOpts?.printName === false ? '' : brand
  const slipFooter = slipOpts?.printFooter === false ? '' : footerNote
  const vatLabel = t.vat
  const guestTag = kind === 'guest' ? t.printGuestTag : kind === 'ebill' ? t.printEbillTag : undefined

  function vatTip(items: string[]) {
    if (!items.length) return undefined
    return items.map((n) => `${n}`).join(' · ')
  }

  const paySplits = (receipt.splitPayments ?? []).filter((p) => !/^Food voucher/i.test(p.method))
  /** When splits exist, amounts live only on split rows — Paid by stays short (no duplicate). */
  const paidByLabel =
    kind === 'paid' && paySplits.length
      ? paySplits.map((p) => p.method).join(' + ')
      : receipt.method
  const amountPaid = Math.round(
    (paySplits.length
      ? paySplits.reduce((s, p) => s + p.amount, 0)
      : typeof receipt.tendered === 'number' && (receipt.change ?? 0) >= 0
        ? Math.max(0, receipt.tendered - (receipt.change ?? 0))
        : receipt.total) * 100,
  ) / 100
  const highlightPay = kind === 'paid'
  /** Title already has "Table 01 · …" — skip the second Table:01 line. */
  const titleHasTable =
    Boolean(receipt.tableLabel) &&
    new RegExp(
      `(${t.printTable}|Table)\\s*[:.]?\\s*${String(receipt.tableLabel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'i',
    ).test(receipt.title)
  const showTableLine = Boolean(receipt.tableLabel) && !titleHasTable

  function handlePrint() {
    const items = [
      {
        label: t.printColItem,
        qty: t.printColQty,
        rate: t.printColRate,
        value: t.printColTotal,
        strong: true,
        isHeader: true,
      },
      ...receipt.lines.map((line) => {
        const { en, ar } = lineItemParts(line)
        return {
          label: en,
          labelAr: ar || undefined,
          qty: String(line.qty),
          rate: moneyPlain(line.price, lang),
          value: moneyPlain(line.qty * line.price, lang),
        }
      }),
    ]
    const totals: {
      label: string
      value: string
      strong?: boolean
      muted?: boolean
      billTotal?: boolean
    }[] = [
      { label: t.printGoods, value: money(receipt.subtotal, lang), muted: true },
    ]
    if (receipt.discountAmt && receipt.discountAmt > 0) {
      totals.push({ label: t.discount, value: `-${money(receipt.discountAmt, lang)}`, muted: true })
    }
    for (const c of receipt.charges ?? []) {
      totals.push({ label: c.name, value: money(c.amount, lang), muted: true })
    }
    if (receipt.foodVoucherAmt && receipt.foodVoucherAmt > 0) {
      const label = receipt.foodVoucherCode
        ? `${t.printFoodVoucher} ${receipt.foodVoucherCode}`
        : t.printFoodVoucher
      totals.push({ label, value: `-${money(receipt.foodVoucherAmt, lang)}`, muted: true })
    }
    if (vatRows.length > 1) {
      for (const row of vatRows) {
        totals.push({
          label: vatRateLabel(row.percent),
          value: money(row.tax, lang),
          muted: true,
        })
      }
    } else if (vatRows.length === 1) {
      totals.push({
        label: vatRateLabel(vatRows[0]!.percent),
        value: money(vatRows[0]!.tax, lang),
        muted: true,
      })
    } else if (receipt.tax > 0) {
      totals.push({ label: vatLabel, value: money(receipt.tax, lang), muted: true })
    }
    if (receipt.loyaltyRedeem && receipt.loyaltyRedeem > 0) {
      totals.push({
        label: t.printLoyaltyRedeem,
        value: `-${money(receipt.loyaltyRedeem, lang)}`,
        muted: true,
      })
    }
    totals.push({ label: t.total, value: money(receipt.total, lang), billTotal: highlightPay })
    if (kind === 'paid') {
      totals.push({ label: t.printPaidBy, value: paidByLabel })
    } else {
      totals.push({ label: t.status, value: receipt.method })
    }
    if (paySplits.length) {
      paySplits.forEach((p, i) => {
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
    if (highlightPay) {
      totals.push({ label: t.printAmountPaid, value: money(amountPaid, lang), strong: true })
    }
    if (typeof receipt.tendered === 'number') {
      totals.push({ label: t.printTendered, value: money(receipt.tendered, lang) })
      totals.push({ label: t.printChange, value: money(receipt.change ?? 0, lang) })
    }

    const job = receiptSlipToJob(
      {
        brand: slipBrand,
        meta: [
          ...companyHeaderLines,
          receipt.title,
          receipt.time,
          ...(typeof receipt.billNo === 'number' ? [`${t.printBillNo} : ${receipt.billNo}`] : []),
          ...(showTableLine ? [`${t.printTable}:${receipt.tableLabel}`] : []),
          ...(receipt.customerName ? [receipt.customerName] : []),
        ].filter(Boolean),
        metaAr:
          templateId === 'bilingual' && kind === 'paid' && vatNo
            ? [`${t.printVatNo}: ${vatNo}`]
            : undefined,
        tag: guestTag,
        items,
        totals,
        footer: slipFooter,
        qrDataUrl: kind === 'paid' ? qrDataUrl : undefined,
        qrCaption: kind === 'paid' && qrDataUrl ? 'ZATCA e-invoice' : undefined,
        paperWidthMm: paperMm,
        templateId,
        type: kind === 'guest' ? 'temp-bill' : 'receipt',
        lang,
      },
      station,
    )
    job.openDrawer = kind === 'paid' && !reprint && printCount.current === 0
    const ref = [kind === 'guest' ? 'Bill' : 'Receipt', typeof receipt.billNo === 'number' ? `#${receipt.billNo}` : '', receipt.title]
      .filter(Boolean)
      .join(' · ')
    setPrintState({ phase: 'printing' })
    void printEscPos(job, ref).then((res) => {
      if (res.ok) {
        printCount.current += 1
        const viaAgent = res.mode === 'agent'
        setPrintState({
          phase: 'done',
          printer: viaAgent ? station?.name : undefined,
          dialog: !viaAgent,
          at: new Date(),
          count: printCount.current,
        })
        if (viaAgent) flash(t.printSentTo.replace('{printer}', station?.name || t.printAction), 'ok')
        return
      }
      setPrintState({ phase: 'failed', queued: res.queued === true })
      if (!res.queued) flash(t.printingBlocked, 'err')
    })
  }

  const printBusy = printState.phase === 'printing'
  const printTime = printState.phase === 'done'
    ? printState.at.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : ''
  const printStatusText =
    printState.phase === 'printing'
      ? t.printSending
      : printState.phase === 'done'
        ? printState.dialog
          ? t.printDialogOpened
          : (printState.count > 1 ? t.printDoneTimes : t.printDoneOn)
              .replace('{printer}', printState.printer || '')
              .replace('{time}', printTime)
              .replace('{n}', String(printState.count))
        : printState.phase === 'failed'
          ? printState.queued
            ? t.printFailedKept
            : t.printingBlocked
          : ''

  const canAutoPrint = !reprint && kind !== 'ebill' && station?.options.autoPrint === true
  useEffect(() => {
    if (!canAutoPrint || qrWaiting || autoPrinted.current) return
    // Short delay: the ZATCA effect above flips qrWaiting on in the same commit
    const timer = window.setTimeout(() => {
      autoPrinted.current = true
      handlePrint()
    }, 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoPrint, qrWaiting])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="modal-card receipt-card">
        <div className="section-head">
          <h2>{heading}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.printDone}
          </button>
        </div>
        <div className="receipt-body">
          <strong className="receipt-brand">{brand}</strong>
          {companyHeaderLines.map((line) => (
            <p
              key={line}
              className={`receipt-meta${
                line.startsWith(t.printVatNo) ? ' receipt-meta-strong mesa-ltr-nums' : ''
              }`}
            >
              {line}
            </p>
          ))}
          <p className="receipt-meta">{receipt.title}</p>
          <p className="receipt-meta">{receipt.time}</p>
          {typeof receipt.billNo === 'number' ? (
            <p className="receipt-meta receipt-bill-no mesa-ltr-nums">
              {t.printBillNo} : {receipt.billNo}
            </p>
          ) : null}
          {showTableLine ? (
            <p className="receipt-meta receipt-meta-row">
              <span>
                {t.printTable}:{receipt.tableLabel}
              </span>
            </p>
          ) : null}
          {receipt.customerName ? <p className="receipt-meta">{receipt.customerName}</p> : null}
          {guestTag ? <span className="receipt-guest-tag">{guestTag}</span> : null}
          <div className="receipt-lines">
            <div className="receipt-line receipt-line-head" aria-hidden="true">
              <span className="r-item">{t.printColItem}</span>
              <span className="r-qty">{t.printColQty}</span>
              <span className="r-rate">{t.printColRate}</span>
              <span className="r-total">{t.printColTotal}</span>
            </div>
            {receipt.lines.map((line) => {
              const { en, ar } = lineItemParts(line)
              return (
              <div key={line.id} className="receipt-line receipt-line-cols">
                <span className="r-item">
                  <span className="r-item-en">{en}</span>
                  {ar ? <span className="r-item-ar" dir="rtl" lang="ar">{ar}</span> : null}
                </span>
                <span className="r-qty mesa-ltr-nums">{line.qty}</span>
                <span className="r-rate mesa-ltr-nums">{moneyPlain(line.price, lang)}</span>
                <span className="r-total mesa-ltr-nums">{moneyPlain(line.qty * line.price, lang)}</span>
              </div>
              )
            })}
          </div>
          <div className="receipt-line muted">
            <span>{t.printGoods}</span>
            <span>{money(receipt.subtotal, lang)}</span>
          </div>
          {receipt.discountAmt && receipt.discountAmt > 0 ? (
            <div className="receipt-line muted">
              <span>{t.discount}</span>
              <span>-{money(receipt.discountAmt, lang)}</span>
            </div>
          ) : null}
          {(receipt.charges ?? []).map((c) => (
            <div key={`${c.name}-${c.amount}`} className="receipt-line muted">
              <span>{c.name}</span>
              <span>{money(c.amount, lang)}</span>
            </div>
          ))}
          {receipt.foodVoucherAmt && receipt.foodVoucherAmt > 0 ? (
            <div className="receipt-line muted">
              <span>
                {receipt.foodVoucherCode
                  ? `${t.printFoodVoucher} ${receipt.foodVoucherCode}`
                  : t.printFoodVoucher}
              </span>
              <span>-{money(receipt.foodVoucherAmt, lang)}</span>
            </div>
          ) : null}
          {vatRows.length > 0
            ? vatRows.map((row) => (
                <div
                  key={`vat-${row.percent}`}
                  className="receipt-line muted receipt-vat-row"
                  title={vatTip(row.items)}
                >
                  <span>
                    {vatRateLabel(row.percent)}
                    {row.items.length ? (
                      <abbr className="receipt-vat-hint" title={vatTip(row.items)}>
                        {' '}
                        ⓘ
                      </abbr>
                    ) : null}
                  </span>
                  <span>{money(row.tax, lang)}</span>
                </div>
              ))
            : receipt.tax > 0 ? (
                <div className="receipt-line muted">
                  <span>{vatLabel}</span>
                  <span>{money(receipt.tax, lang)}</span>
                </div>
              ) : null}
          {receipt.loyaltyRedeem && receipt.loyaltyRedeem > 0 ? (
            <div className="receipt-line muted">
              <span>{t.printLoyaltyRedeem}</span>
              <span>-{money(receipt.loyaltyRedeem, lang)}</span>
            </div>
          ) : null}
          <div className={highlightPay ? 'receipt-line receipt-bill-total' : 'receipt-line total'}>
            <span>{t.total}</span>
            <span>{money(receipt.total, lang)}</span>
          </div>
          {kind === 'paid' ? (
            <div className="receipt-line">
              <span>{t.printPaidBy}</span>
              <span>{paidByLabel}</span>
            </div>
          ) : (
            <div className="receipt-line">
              <span>{t.status}</span>
              <span>{receipt.method}</span>
            </div>
          )}
          {paySplits.length ? (
            <>
              {paySplits.map((p, i) => (
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
          {highlightPay ? (
            <div className="receipt-line total">
              <span>{t.printAmountPaid}</span>
              <span>{money(amountPaid, lang)}</span>
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
          {kind === 'paid' && qrDataUrl ? (
            <div className="receipt-zatca">
              {qrWaiting ? (
                <div className="receipt-zatca-wait" role="status" aria-live="polite">
                  <span className="receipt-zatca-spinner" aria-hidden="true" />
                  <small>{t.zatcaQrPreparing}</small>
                </div>
              ) : (
                <img
                  src={qrDataUrl}
                  alt="ZATCA e-invoice QR"
                  className={qrDense ? 'qr-dense' : undefined}
                  width={qrDense ? 240 : 120}
                  height={qrDense ? 240 : 120}
                />
              )}
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
        {printStatusText ? (
          <p className={`receipt-print-status st-${printState.phase}`} role="status" aria-live="polite">
            {printStatusText}
          </p>
        ) : null}
        <div className="action-row">
          {(kind === 'guest' || kind === 'ebill' || kind === 'paid') && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrint}
              disabled={qrWaiting || printBusy}
              title={qrWaiting ? t.zatcaQrPreparing : undefined}
            >
              {qrWaiting
                ? t.zatcaWaitPrint
                : printBusy
                  ? t.printSending
                  : printState.phase === 'done'
                    ? t.printAgain
                    : t.printAction}
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
