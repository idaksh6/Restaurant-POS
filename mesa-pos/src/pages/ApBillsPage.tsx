import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { pathAllowed } from '../auth/roles'
import AccessDenied from '../components/AccessDenied'
import AccountsShell from '../components/AccountsShell'
import { money } from '../data/mock'
import { buildApBills } from '../lib/balanceSummary'
import { downloadTextFile } from '../lib/glJournal'
import { toCsv } from '../lib/dataTransfer'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePurchasing } from '../state/PurchasingContext'

export default function ApBillsPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { vendorLedger, suppliers } = usePurchasing()
  const [openOnly, setOpenOnly] = useState(true)

  if (!user || !pathAllowed(user.role, '/accounts')) {
    return <AccessDenied pathname="/accounts/ap" />
  }

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id
  const bills = useMemo(() => buildApBills(vendorLedger, supplierName), [vendorLedger, suppliers])
  const rows = openOnly ? bills.filter((b) => b.balance > 0.009) : bills
  const openTotal = rows.reduce((s, b) => s + b.balance, 0)
  const fmt = (n: number) => money(n, lang)

  function exportCsv() {
    const csv = toCsv(
      ['Date', 'Supplier', 'Description', 'Amount', 'Paid', 'Balance'],
      rows.map((b) => [b.date, supplierName(b.supplierId), b.description, b.amount, b.paid, b.balance]),
    )
    downloadTextFile(`isarva-ap-bills-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <AccountsShell
      active="ap"
      title={t.apTitle}
      subtitle={t.apHint}
      actions={
        <>
          <Link to="/settings/vendors" className="btn btn-ghost">
            {t.vendors}
          </Link>
          <button type="button" className="btn btn-teal" onClick={exportCsv} disabled={!rows.length}>
            {t.apExport}
          </button>
        </>
      }
    >
      <div className="acct-gl-panel">
        <div className="acct-gl-toolbar">
          <label className="acct-gl-check">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            <span>{t.apOpenOnly}</span>
          </label>
          <div className="acct-gl-stat-inline">
            <em>{t.apOpenCount}</em>
            <strong className="mesa-ltr-nums">
              {rows.length} · {fmt(openTotal)}
            </strong>
          </div>
        </div>

        {!rows.length ? (
          <p className="acct-gl-muted">{t.apEmpty}</p>
        ) : (
          <div className="acct-gl-table-wrap">
            <table className="acct-gl-table">
              <thead>
                <tr>
                  <th>{t.expenseColDate}</th>
                  <th>{t.apSupplier}</th>
                  <th>{t.expenseColNarration}</th>
                  <th>{t.apAmount}</th>
                  <th>{t.apPaid}</th>
                  <th>{t.apBalance}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="mesa-ltr-nums">{b.date}</td>
                    <td>{supplierName(b.supplierId)}</td>
                    <td>{b.description}</td>
                    <td className="mesa-ltr-nums">{fmt(b.amount)}</td>
                    <td className="mesa-ltr-nums">{fmt(b.paid)}</td>
                    <td className="mesa-ltr-nums">{fmt(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AccountsShell>
  )
}
