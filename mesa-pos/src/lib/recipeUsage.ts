import type { Ingredient } from '../data/ingredients'
import type { MasterDish } from '../data/masters'
import { recipeLineIngredientId } from '../data/masters'
import type { StockItem } from '../data/mock'

export type RecipeUsageLine = {
  ingredientId: string
  qty: number
  unit: string
  name: string
}

export type RecipeUsageRow = {
  dishId: string
  dishName: string
  dishCode: string
  category: string
  active: boolean
  lines: RecipeUsageLine[]
}

export function buildRecipeUsage(
  dishes: MasterDish[],
  ingredients: Ingredient[],
  stock: StockItem[],
): RecipeUsageRow[] {
  return dishes
    .filter((d) => (d.recipe ?? []).length > 0)
    .map((d) => ({
      dishId: d.id,
      dishName: d.name,
      dishCode: d.code,
      category: d.category,
      active: d.active,
      lines: (d.recipe ?? []).map((r) => {
        const ingId = recipeLineIngredientId(r)
        const ing = ingredients.find((i) => i.id === ingId)
        const s = stock.find((x) => x.ingredientId === ingId || x.id === ingId)
        return {
          ingredientId: ingId,
          qty: r.qty,
          unit: ing?.unit ?? s?.unit ?? '',
          name: ing?.name ?? s?.name ?? ingId,
        }
      }),
    }))
    .sort((a, b) => a.dishName.localeCompare(b.dishName))
}
