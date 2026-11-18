/**
 * Transform Revel Systems Ingredient resource → canonical StockLevel.
 *
 * Revel tracks inventory at the Ingredient level (raw materials / prep items).
 * Endpoint:  GET /resources/Ingredient/
 *
 * Key inventory fields:
 *   id, name, quantity (current on-hand), par_level (reorder point),
 *   reorder_qty, in_stock (bool), establishment (FK → location),
 *   cost (unit cost USD float), updated_date
 *
 * Revel also surfaces out-of-stock changes via the `inout.stock` webhook.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawRevelIngredient {
  /** PK integer. */
  id: number | string
  /** Human-readable ingredient/item name. */
  name?: string
  /** Current on-hand quantity (float, may be fractional for weight items). */
  quantity?: number | string | null
  /** Par level / reorder point. */
  par_level?: number | string | null
  /** Reorder quantity. */
  reorder_qty?: number | string | null
  /** Simple boolean: is this ingredient in stock? */
  in_stock?: boolean | number | string | null
  /** FK to Establishment (location). Integer or resource URI. */
  establishment?: number | string | null
  /** Unit cost in USD (float). */
  cost?: number | string | null
  /** ISO-8601 last-modified timestamp. */
  updated_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawRevelIngredient): StockLevel {
  const productId = String(raw.id)
  const locationId = resolveEstablishment(raw.establishment)
  const qtyOnHand = pickNum(raw.quantity) ?? 0

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: qtyOnHand,
    reorderPoint: pickNum(raw.par_level),
    reorderQuantity: pickNum(raw.reorder_qty),
    platform: 'revel-systems',
    metadata: strMap({
      name: raw.name,
      in_stock: raw.in_stock,
      cost: raw.cost,
      updated_date: raw.updated_date,
    }),
    raw,
  }
}

/** Revel may return establishment as integer or as resource URI "/resources/Establishment/5/". */
function resolveEstablishment(v: number | string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  const match = /\/(\d+)\/?$/.exec(s)
  return match ? match[1] : s
}
