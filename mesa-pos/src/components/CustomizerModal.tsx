import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { money } from '../data/mock'
import type { AddonGroup, MasterDish } from '../data/masters'
import { getAddonGroups } from '../data/masters'

type Props = {
  dish: MasterDish
  onClose: () => void
  onSave: (payload: { name: string; price: number; note?: string }) => void
}

export default function CustomizerModal({ dish, onClose, onSave }: Props) {
  const customizer = dish.customizer
  if (!customizer) return null
  return <CustomizerBody dish={dish} customizer={customizer} onClose={onClose} onSave={onSave} />
}

function CustomizerBody({
  dish,
  customizer,
  onClose,
  onSave,
}: Props & { customizer: NonNullable<MasterDish['customizer']> }) {
  const groups = useMemo(() => getAddonGroups(customizer), [customizer])
  const firstId = customizer.variations[0]?.id ?? ''
  const [variationId, setVariationId] = useState(firstId)
  const [addonQty, setAddonQty] = useState<Record<string, number>>({})
  const [alert, setAlert] = useState('')

  const variation =
    customizer.variations.find((v) => v.id === variationId) ?? customizer.variations[0]

  const allAddons = useMemo(() => groups.flatMap((g) => g.addons), [groups])

  function addonPrice(addonId: string) {
    const addon = allAddons.find((a) => a.id === addonId)
    if (!addon) return 0
    return addon.variationPrices?.[variationId] ?? addon.price
  }

  function groupCount(group: AddonGroup) {
    return group.addons.reduce((sum, a) => sum + (addonQty[a.id] ?? 0), 0)
  }

  const selectedAddons = allAddons.filter((a) => (addonQty[a.id] ?? 0) > 0)
  const addonTotal = selectedAddons.reduce(
    (sum, a) => sum + addonPrice(a.id) * (addonQty[a.id] ?? 0),
    0,
  )
  const total = (variation?.price ?? dish.price) + addonTotal

  const summary = useMemo(() => {
    const parts = [variation?.name, ...selectedAddons.map((a) => a.name)]
    return parts.filter(Boolean).join(' · ')
  }, [variation, selectedAddons])

  function selectVariation(id: string) {
    setVariationId(id)
    setAddonQty({})
    setAlert('')
  }

  function toggleAddon(group: AddonGroup, id: string) {
    setAlert('')
    setAddonQty((prev) => {
      const current = prev[id] ?? 0
      if (current > 0) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      const count = group.addons.reduce((s, a) => s + (a.id === id ? 0 : prev[a.id] ?? 0), 0)
      if (count >= group.max) {
        setAlert(`You can select max ${group.max} from "${group.name}"`)
        return prev
      }
      return { ...prev, [id]: 1 }
    })
  }

  function save() {
    for (const group of groups) {
      const count = groupCount(group)
      if (count < group.min) {
        setAlert(`You have to select min ${group.min} addon(s) from group ${group.name}`)
        return
      }
    }
    onSave({ name: `${dish.name} (${summary})`, price: total, note: summary })
  }

  function groupLabel(group: AddonGroup) {
    if (group.appendVariationName && variation) {
      return `${group.name} ${variation.name}`
    }
    return group.name
  }

  return createPortal(
    <div className="modal-backdrop cz-backdrop" role="dialog" aria-modal="true">
      <div className="cz-card">
        <div className="cz-header">
          <div>
            <div className="cz-dish-name">{dish.name}</div>
            <div className="cz-dish-sub">
              Code {dish.code} · {customizer.title}
            </div>
          </div>
          <button type="button" className="cz-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cz-body">
          <div className="cz-section">
            <div className="cz-section-title">{customizer.variationLabel}</div>
            <div className="cz-variations">
              {customizer.variations.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`cz-var-btn${variationId === v.id ? ' active' : ''}`}
                  onClick={() => selectVariation(v.id)}
                >
                  <span className="cz-var-name">{v.name}</span>
                  <span className="cz-var-price">{money(v.price)}</span>
                </button>
              ))}
            </div>
          </div>

          {alert ? <div className="cz-alert">⚠ {alert}</div> : null}

          {groups.map((group) => {
            const count = groupCount(group)
            const req =
              group.min > 0
                ? `min ${group.min}`
                : group.max < 99
                  ? `max ${group.max}`
                  : null
            return (
              <div key={group.id} className="cz-section">
                <div className="cz-section-title">
                  {groupLabel(group)}
                  {req ? <span className="cz-req">{req}</span> : null}
                  <span className={`cz-addon-count${count >= group.max ? ' full' : ''}${count >= group.min && group.min > 0 ? ' ok' : ''}`}>
                    {count}/{group.max}
                  </span>
                </div>
                <div className="cz-addons">
                  {group.addons.map((a) => {
                    const selected = (addonQty[a.id] ?? 0) > 0
                    const price = addonPrice(a.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`cz-addon${selected ? ' selected' : ''}`}
                        onClick={() => toggleAddon(group, a.id)}
                      >
                        {selected ? <span className="cz-addon-badge">1</span> : null}
                        <span className="cz-addon-name">{a.name}</span>
                        <span className="cz-addon-price">
                          {price > 0 ? money(price) : money(0)}
                        </span>
                        {selected ? (
                          <span
                            className="cz-addon-minus"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleAddon(group, a.id)
                            }}
                          >
                            −
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="cz-footer">
          <span className="cz-total">{money(total)}</span>
          <div className="cz-footer-actions">
            <button type="button" className="btn btn-ghost cz-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary cz-btn cz-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
