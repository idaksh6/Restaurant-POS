import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { pathAllowed } from '../auth/roles'
import AccessDenied from '../components/AccessDenied'
import AccountsShell from '../components/AccountsShell'
import MesaSelect from '../components/MesaSelect'
import { loadCoaMapping } from '../data/chartOfAccounts'
import { money } from '../data/mock'
import { buildApBills, buildBalanceSummary } from '../lib/balanceSummary'
import {
  buildGlJournal,
  downloadTextFile,
  glJournalCsv,
  glJournalTotals,
  type GlExportFormat,
} from '../lib/glJournal'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function GlExportPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { flash, ledger, stock } = usePos()
  const { expenseDetails, expenseTypes } = useCatalog()
  const { dishes } = useMasters()
  const { vendorLedger, suppliers } = usePurchasing()
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayIso)
  const [format, setFormat] = useState<GlExportFormat>('excel')
  const [includeCogs, setIncludeCogs] = useState(true)
  const [includeAp, setIncludeAp] = useState(true)

  if (!user || !pathAllowed(user.role, '/accounts')) {
    return <AccessDenied pathname="/accounts/gl-export" />
  }

  const expenseTypeName = (id: string) => expenseTypes.find((x) => x.id === id)?.name ?? id
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id

  const rows = useMemo(
    () =>
      buildGlJournal({
        from,
        to,
        ledger,
        expenses: expenseDetails,
        vendorLedger,
        dishes,
        expenseTypeName,
        supplierName,
        mapping: loadCoaMapping(),
        includeCogs,
        includeAp,
      }),
    [from, to, ledger, expenseDetails, vendorLedger, dishes, expenseTypes, suppliers, includeCogs, includeAp],
  )

  const totals = useMemo(() => glJournalTotals(rows), [rows])
  const summary = useMemo(
    () =>
      buildBalanceSummary({
        from,
        to,
        ledger,
        expenses: expenseDetails,
        vendorLedger,
        stock,
        dishes,
      }),
    [from, to, ledger, expenseDetails, vendorLedger, stock, dishes],
  )
  const openAp = useMemo(
    () => buildApBills(vendorLedger, supplierName).filter((b) => b.balance > 0.009),
    [vendorLedger, suppliers],
  )

  function exportCsv() {
    const csv = glJournalCsv(rows, format)
    const stamp = `${from}_to_${to}`
    downloadTextFile(`isarva-gl-journal-${stamp}-${format}.csv`, csv)
    flash(t.glExportOk)
  }

  const fmt = (n: number) => money(n, lang)

  return (
    <AccountsShell
      active="gl-export"
      title={t.glTitle}
      subtitle={t.glHint}
      actions={
        <>
          <Link to="/accounts/coa" className="btn btn-ghost">
            {t.coaTitle}
          </Link>
          <button type="button" className="btn btn-teal" onClick={exportCsv} disabled={!rows.length}>
            {t.glDownload}
          </button>
        </>
      }
    >
      <div className="acct-gl-panel">
        <div className="acct-gl-toolbar">
          <label className="acct-gl-field">
            <span>{t.expenseFilterFrom}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="acct-gl-field">
            <span>{t.expenseFilterTo}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="acct-gl-field">
            <span>{t.glFormat}</span>
            <MesaSelect
              value={format}
              onChange={(v) => setFormat(v as GlExportFormat)}
              options={[
                { value: 'excel', label: t.glFormatExcel },
                { value: 'quickbooks', label: t.glFormatQb },
                { value: 'zoho', label: t.glFormatZoho },
              ]}
            />
          </label>
          <label className="acct-gl-check">
            <input type="checkbox" checked={includeCogs} onChange={(e) => setIncludeCogs(e.target.checked)} />
            <span>{t.glIncludeCogs}</span>
          </label>
          <label className="acct-gl-check">
            <input type="checkbox" checked={includeAp} onChange={(e) => setIncludeAp(e.target.checked)} />
            <span>{t.glIncludeAp}</span>
          </label>
        </div>

        <div className="acct-gl-stats">
          <div>
            <em>{t.glLines}</em>
            <strong className="mesa-ltr-nums">{rows.length}</strong>
          </div>
          <div>
            <em>{t.glDebit}</em>
            <strong className="mesa-ltr-nums">{fmt(totals.debit)}</strong>
          </div>
          <div>
            <em>{t.glCredit}</em>
            <strong className="mesa-ltr-nums">{fmt(totals.credit)}</strong>
          </div>
          <div>
            <em>{t.glBalance}</em>
            <strong className={totals.balanced ? 'ok' : 'warn'}>
              {totals.balanced ? t.glBalanced : t.glUnbalanced}
            </strong>
          </div>
        </div>

        <section className="acct-gl-card">
          <h3>{t.glBalanceSummary}</h3>
          <div className="acct-gl-summary-grid">
            <div>
              <span>{t.glSales}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.salesTotal)}</strong>
            </div>
            <div>
              <span>{t.glVat}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.vatCollected)}</strong>
            </div>
            <div>
              <span>{t.glCogs}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.estimatedCogs)}</strong>
            </div>
            <div>
              <span>{t.glExpenses}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.expensesPaid)}</strong>
            </div>
            <div>
              <span>{t.glApOpen}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.apOutstanding)}</strong>
            </div>
            <div>
              <span>{t.glInventory}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.inventoryValue)}</strong>
            </div>
            <div>
              <span>{t.glGiftLiab}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.giftLiability)}</strong>
            </div>
            <div>
              <span>{t.glNetCash}</span>
              <strong className="mesa-ltr-nums">{fmt(summary.netCashPosition)}</strong>
            </div>
          </div>
        </section>

        <section className="acct-gl-card">
          <header className="acct-gl-card-head">
            <h3>{t.apTitle}</h3>
            <Link to="/accounts/ap">{t.apViewAll}</Link>
          </header>
          <p className="acct-gl-muted">
            {openAp.length} {t.apOpenCount} · {fmt(openAp.reduce((s, b) => s + b.balance, 0))}
          </p>
        </section>

        <section className="acct-gl-card">
          <h3>{t.glPreview}</h3>
          {!rows.length ? (
            <p className="acct-gl-muted">{t.glEmpty}</p>
          ) : (
            <div className="acct-gl-table-wrap">
              <table className="acct-gl-table">
                <thead>
                  <tr>
                    <th>{t.expenseColDate}</th>
                    <th>{t.glJournalNo}</th>
                    <th>{t.coaCode}</th>
                    <th>{t.coaName}</th>
                    <th>{t.glDebit}</th>
                    <th>{t.glCredit}</th>
                    <th>{t.expenseColNarration}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 80).map((r, i) => (
                    <tr key={`${r.journalNo}-${r.accountCode}-${i}`}>
                      <td className="mesa-ltr-nums">{r.date}</td>
                      <td className="mesa-ltr-nums">{r.journalNo}</td>
                      <td className="mesa-ltr-nums">{r.accountCode}</td>
                      <td>{r.accountName}</td>
                      <td className="mesa-ltr-nums">{r.debit ? fmt(r.debit) : ''}</td>
                      <td className="mesa-ltr-nums">{r.credit ? fmt(r.credit) : ''}</td>
                      <td>{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 80 ? (
                <p className="acct-gl-muted">{t.glPreviewMore.replace('{n}', String(rows.length - 80))}</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AccountsShell>
  )
}
