import { useMemo, useState } from 'react'
import { pathAllowed } from '../auth/roles'
import AccessDenied from '../components/AccessDenied'
import AccountsShell from '../components/AccountsShell'
import MesaSelect from '../components/MesaSelect'
import {
  DEFAULT_COA,
  defaultCoaMapping,
  loadCoaMapping,
  saveCoaMapping,
  type CoaMapping,
} from '../data/chartOfAccounts'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

export default function ChartOfAccountsPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { flash } = usePos()
  const { expenseTypes, paymentTypes } = useCatalog()
  const [mapping, setMapping] = useState<CoaMapping>(() => loadCoaMapping())

  if (!user || !pathAllowed(user.role, '/accounts')) {
    return <AccessDenied pathname="/accounts/coa" />
  }

  const accountOptions = useMemo(
    () =>
      DEFAULT_COA.map((a) => ({
        value: a.code,
        label: `${a.code} · ${lang === 'ar' ? a.nameAr : a.name}`,
      })),
    [lang],
  )

  function setField<K extends keyof CoaMapping>(key: K, value: CoaMapping[K]) {
    setMapping((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    saveCoaMapping(mapping)
    flash(t.coaSaved)
  }

  function resetDefaults() {
    setMapping(defaultCoaMapping())
    flash(t.coaReset)
  }

  return (
    <AccountsShell
      active="coa"
      title={t.coaTitle}
      subtitle={t.coaHint}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={resetDefaults}>
            {t.coaResetBtn}
          </button>
          <button type="button" className="btn btn-teal" onClick={save}>
            {t.save}
          </button>
        </>
      }
    >
      <div className="acct-gl-panel">
        <p className="acct-gl-lead">{t.coaLead}</p>

        <section className="acct-gl-card">
          <h3>{t.coaCoreAccounts}</h3>
          <div className="acct-gl-grid">
            {(
              [
                ['sales', t.coaSales],
                ['vatOutput', t.coaVat],
                ['discounts', t.coaDiscounts],
                ['voids', t.coaVoids],
                ['cogs', t.coaCogs],
                ['inventory', t.coaInventory],
                ['ap', t.coaAp],
                ['cash', t.coaCash],
                ['card', t.coaCard],
                ['delivery', t.coaDelivery],
                ['giftLiability', t.coaGift],
                ['defaultExpense', t.coaDefaultExpense],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="acct-gl-field">
                <span>{label}</span>
                <MesaSelect
                  value={mapping[key]}
                  onChange={(v) => setField(key, v)}
                  options={accountOptions}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="acct-gl-card">
          <h3>{t.coaExpenseMap}</h3>
          <p className="acct-gl-muted">{t.coaExpenseMapHint}</p>
          <div className="acct-gl-grid">
            {expenseTypes.filter((x) => x.active).map((et) => (
              <label key={et.id} className="acct-gl-field">
                <span>{et.name}</span>
                <MesaSelect
                  value={mapping.expenseByType[et.id] || mapping.defaultExpense}
                  onChange={(v) =>
                    setMapping((prev) => ({
                      ...prev,
                      expenseByType: { ...prev.expenseByType, [et.id]: v },
                    }))
                  }
                  options={accountOptions}
                />
              </label>
            ))}
            {!expenseTypes.filter((x) => x.active).length ? (
              <p className="acct-gl-muted">{t.coaNoExpenseTypes}</p>
            ) : null}
          </div>
        </section>

        <section className="acct-gl-card">
          <h3>{t.coaTenderMap}</h3>
          <p className="acct-gl-muted">{t.coaTenderMapHint}</p>
          <div className="acct-gl-grid">
            {paymentTypes.filter((p) => p.active).map((pt) => (
              <label key={pt.id} className="acct-gl-field">
                <span>{pt.name}</span>
                <MesaSelect
                  value={
                    mapping.tenderByMethod[pt.id] ||
                    mapping.tenderByMethod[pt.name.toLowerCase()] ||
                    mapping.cash
                  }
                  onChange={(v) =>
                    setMapping((prev) => ({
                      ...prev,
                      tenderByMethod: {
                        ...prev.tenderByMethod,
                        [pt.id]: v,
                        [pt.name.toLowerCase()]: v,
                      },
                    }))
                  }
                  options={accountOptions}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="acct-gl-card">
          <h3>{t.coaCatalog}</h3>
          <div className="acct-gl-table-wrap">
            <table className="acct-gl-table">
              <thead>
                <tr>
                  <th>{t.coaCode}</th>
                  <th>{t.coaName}</th>
                  <th>{t.coaType}</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_COA.map((a) => (
                  <tr key={a.code}>
                    <td className="mesa-ltr-nums">{a.code}</td>
                    <td>{lang === 'ar' ? a.nameAr : a.name}</td>
                    <td>{a.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AccountsShell>
  )
}
