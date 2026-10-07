import { useMemo, useState } from 'react'
import { HubFooter, HubHeader } from '../components/HubChrome'
import {
  loadLoyaltyCampaigns,
  saveLoyaltyCampaigns,
  type LoyaltyCampaign,
} from '../data/loyaltyCampaigns'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { usePos } from '../state/PosContext'

export default function LoyaltyCampaignsPage() {
  const { t } = useI18n()
  const { flash } = usePos()
  const [rows, setRows] = useState(() => loadLoyaltyCampaigns())
  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows])

  function patch(id: string, next: Partial<LoyaltyCampaign>) {
    setRows((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, ...next } : r))
      saveLoyaltyCampaigns(updated)
      return updated
    })
  }

  function saveAll() {
    saveLoyaltyCampaigns(rows)
    flash(t.loyaltyCampSaved)
  }

  return (
    <div className="panel floor-panel">
      <HubHeader closeTo={settingsHubPath('settings')} />
      <div className="zk-co-wrap">
        <section className="zk-co-panel">
          <div className="zk-co-panel-head">
            <div>
              <h2>{t.loyaltyCampTitle}</h2>
              <p>{t.loyaltyCampHint}</p>
            </div>
            <span className="bo-chip">{activeCount}</span>
          </div>
          <div className="zk-co-fields">
            {rows.map((camp) => (
              <div
                key={camp.id}
                className="zk-co-span-2"
                style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}
              >
                <div className="zk-co-fields">
                  <label className="zk-co-field">
                    <span>{t.name}</span>
                    <input
                      className="zk-co-input"
                      value={camp.name}
                      onChange={(e) => patch(camp.id, { name: e.target.value })}
                    />
                  </label>
                  <div className="zk-co-field">
                    <span>{t.loyaltyActive}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={camp.active}
                      className={`zk-user-switch${camp.active ? ' on' : ''}`}
                      onClick={() => patch(camp.id, { active: !camp.active })}
                    >
                      <i aria-hidden />
                      <strong>{camp.active ? t.onLabel : t.offLabel}</strong>
                    </button>
                  </div>
                  <label className="zk-co-field">
                    <span>{t.type}</span>
                    <strong>
                      {camp.type === 'birthday' ? t.loyaltyTypeBirthday : t.loyaltyTypePunch}
                    </strong>
                  </label>
                  <label className="zk-co-field">
                    <span>{t.loyaltyBonusPts}</span>
                    <input
                      className="zk-co-input mesa-ltr-nums"
                      type="number"
                      min={0}
                      value={camp.bonusPts}
                      onChange={(e) => patch(camp.id, { bonusPts: Number(e.target.value) || 0 })}
                    />
                  </label>
                  {camp.type === 'birthday' ? (
                    <label className="zk-co-field">
                      <span>{t.loyaltyWindowDays}</span>
                      <input
                        className="zk-co-input mesa-ltr-nums"
                        type="number"
                        min={0}
                        value={camp.windowDays ?? 7}
                        onChange={(e) => patch(camp.id, { windowDays: Number(e.target.value) || 0 })}
                      />
                    </label>
                  ) : (
                    <label className="zk-co-field">
                      <span>{t.loyaltyVisitsRequired}</span>
                      <input
                        className="zk-co-input mesa-ltr-nums"
                        type="number"
                        min={2}
                        value={camp.visitsRequired ?? 5}
                        onChange={(e) =>
                          patch(camp.id, { visitsRequired: Math.max(2, Number(e.target.value) || 2) })
                        }
                      />
                    </label>
                  )}
                  <label className="zk-co-field zk-co-span-2">
                    <span>{t.loyaltyMessageTpl}</span>
                    <input
                      className="zk-co-input"
                      value={camp.messageTemplate}
                      onChange={(e) => patch(camp.id, { messageTemplate: e.target.value })}
                      placeholder="{name} {pts}"
                    />
                  </label>
                </div>
              </div>
            ))}
            <div className="zk-co-span-2">
              <button type="button" className="zk-co-btn" onClick={saveAll}>
                {t.loyaltySave}
              </button>
            </div>
          </div>
        </section>
      </div>
      <HubFooter />
    </div>
  )
}
