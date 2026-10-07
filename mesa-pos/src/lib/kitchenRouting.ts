import type { OrderLine } from '../data/mock'
import type { MasterDish } from '../data/masters'
import { peekDishes } from '../data/repos/mastersRepo'

/** True when this dish should appear on KOT / kitchen display (default: yes). */
export function dishRequiresKitchen(dish: MasterDish | undefined): boolean {
  if (!dish) return true
  if (dish.requiresKitchen === false) return false
  return true
}

export function lineRequiresKitchen(
  line: Pick<OrderLine, 'itemId'>,
  dishes: MasterDish[] = peekDishes(),
): boolean {
  const dish = dishes.find((d) => d.id === line.itemId)
  return dishRequiresKitchen(dish)
}

export function kitchenPendingLines(
  lines: OrderLine[],
  dishes: MasterDish[] = peekDishes(),
): OrderLine[] {
  return lines.filter((line) => !line.sent && lineRequiresKitchen(line, dishes))
}

export function readyServePendingLines(
  lines: OrderLine[],
  dishes: MasterDish[] = peekDishes(),
): OrderLine[] {
  return lines.filter((line) => !line.sent && !lineRequiresKitchen(line, dishes))
}

export function anyUnsentLines(lines: OrderLine[]): OrderLine[] {
  return lines.filter((line) => !line.sent)
}
