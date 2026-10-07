import type { MasterDish } from '../data/masters'
import { getAddonGroups } from '../data/masters'

export type OrderLineNoteParts = {
  /** Size / variation badge */
  size: string | null
  /** Addon / topping badges */
  addons: string[]
  /** Freeform kitchen note (not option badges) */
  kitchenNote: string | null
}

/** Split customizer summary (`Small · Onion`) from freeform kitchen notes. */
export function parseOrderLineNote(
  note: string | null | undefined,
  dish?: MasterDish | null,
): OrderLineNoteParts {
  const raw = note?.trim() ?? ''
  if (!raw) return { size: null, addons: [], kitchenNote: null }

  const parts = raw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean)
  const varNames = new Set(
    (dish?.customizer?.variations ?? []).map((v) => v.name.trim().toLowerCase()),
  )
  const addonNames = new Set(
    dish?.customizer
      ? getAddonGroups(dish.customizer).flatMap((g) =>
          g.addons.map((a) => a.name.trim().toLowerCase()),
        )
      : [],
  )

  const first = parts[0]
  const firstIsVar = Boolean(first && varNames.has(first.toLowerCase()))

  if (firstIsVar) {
    return { size: first!, addons: parts.slice(1), kitchenNote: null }
  }

  // Customizer join format (variation · addon · …) even if masters not loaded yet
  if (parts.length > 1 && raw.includes('·')) {
    return { size: parts[0]!, addons: parts.slice(1), kitchenNote: null }
  }

  if (parts.length === 1 && first && addonNames.has(first.toLowerCase())) {
    return { size: null, addons: [first], kitchenNote: null }
  }

  // Lone short size label when this dish has variations (e.g. "Small")
  if (
    parts.length === 1 &&
    first &&
    varNames.size > 0 &&
    !/\s/.test(first) &&
    first.length <= 24 &&
    !/[.,;:!?]/.test(first)
  ) {
    return { size: first, addons: [], kitchenNote: null }
  }

  return { size: null, addons: [], kitchenNote: raw }
}

/** Drop redundant `(Small · …)` from the line title when options are shown as badges. */
export function lineNameWithoutOptions(displayName: string, note: string | null | undefined) {
  const raw = note?.trim()
  if (!raw) return displayName
  const suffix = ` (${raw})`
  if (displayName.endsWith(suffix)) return displayName.slice(0, -suffix.length).trimEnd()
  return displayName
}
