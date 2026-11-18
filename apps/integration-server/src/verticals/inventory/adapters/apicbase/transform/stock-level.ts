import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, pickStr, strMap} from './shared'

/**
 * Apicbase stock of one stock item at one outlet.
 *
 * List endpoint:   GET /api/v2/inventory/outlets/{outlet_id}/stock_items/stock/
 *   (reference/get-inventory-stock-item-details). "Only base stock items of
 *   ingredients are listed. The quantities and values returned represent the
 *   total amounts for all stock items of that ingredient, expressed in units
 *   of the base stock item." Each row carries id, name, package_description,
 *   par, minimum_quantity_required, quantity (a number) and stock_value (a
 *   number).
 * Detail endpoint: GET /api/v2/inventory/outlets/{outlet_id}/stock_items/{stock_item_id}/stock/
 *   (reference/get-detailed-stock-item-inventory-information). Its `quantity`
 *   and `stock_value` do NOT mean what the list's do: "`quantity` and
 *   `stock_value` are the amounts for the queried stock item only." The
 *   ingredient-wide amounts are `aggregated_quantity` and
 *   `aggregated_stock_value`, "determined by the amounts of every other stock
 *   item in the same inventory that are defined in terms of the stock item
 *   being queried, or that it is defined in terms of." The documented examples
 *   agree: the list row for Cola Can has `quantity` 18.0, and its detail has
 *   `quantity` "12.00" and `aggregated_quantity` "18.00" ("18 = 12 + (1 * 6)").
 *   The detail also returns numbers as strings, and adds storage_locations.
 *
 * Key fields (snake_case):
 *   id                        — the STOCK ITEM id. Not an ingredient id:
 *                               listProducts serves ingredients, which link to
 *                               their stock items only through
 *                               `main_stock_items` URLs, so productId never
 *                               equals a Product id.
 *   aggregated_quantity ??
 *   quantity                  — quantityOnHand: the ingredient-wide amount on
 *                               both paths, so one id reads the same from
 *                               listStockLevels and getStockLevel. The detail's
 *                               item-only `quantity` is kept as
 *                               metadata.item_quantity.
 *                               (`has_theoretical_stock` filters the list on
 *                               it: "only stock items with quantity different
 *                               than zero".)
 *   minimum_quantity_required — "Minimum inventory levels"
 *                               (reference/post-detailed-stock-item-inventory-information)
 *                               → reorderPoint
 *   par                       — "PAR (Periodic Automatic Replenishment)", a
 *                               target level rather than an order quantity,
 *                               kept in metadata
 *   aggregated_stock_value ??
 *   stock_value               — the value of quantityOnHand, kept in metadata
 *                               as stock_value; the detail's item-only
 *                               `stock_value` is metadata.item_stock_value.
 *
 * Neither endpoint returns an available quantity or a last-count date (the
 * `actual` and `last_count_date` this transform once read are not in either
 * response), so quantityAvailable and lastCountedAt stay unset.
 *
 * Neither endpoint names the outlet, so the caller injects `outlet_uid`;
 * getStockLevel injects `stock_item_uid` from the id it was asked for.
 */
export interface RawApicbaseStockLevel {
  id?: string
  name?: string
  stock_item_uid?: string
  stock_item?: string | { uid?: string; id?: string }
  outlet_uid?: string
  outlet?: string | { uid?: string; id?: string }
  par?: number | string | null
  minimum_quantity_required?: number | string | null
  quantity?: number | string | null
  stock_value?: number | string | null
  aggregated_quantity?: number | string | null
  aggregated_stock_value?: number | string | null
  [key: string]: unknown
}

function extractId(v: string | { uid?: string; id?: string } | undefined | null): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.uid ?? v.id ?? ''
}

export function transformStockLevel(raw: RawApicbaseStockLevel): StockLevel {
  const productId = raw.stock_item_uid ?? (extractId(raw.stock_item) || pickStr(raw.id) || '')
  const locationId = raw.outlet_uid ?? extractId(raw.outlet)
  // Only the detail carries the aggregated pair; there `quantity` and
  // `stock_value` are the queried stock item's alone.
  const detail = raw.aggregated_quantity != null || raw.aggregated_stock_value != null

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.aggregated_quantity) ?? pickNum(raw.quantity) ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: pickNum(raw.minimum_quantity_required),
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'apicbase',
    metadata: strMap({
      name: raw.name,
      par: raw.par,
      stock_value: raw.aggregated_stock_value ?? raw.stock_value,
      item_quantity: detail ? raw.quantity : undefined,
      item_stock_value: detail ? raw.stock_value : undefined,
    }),
    raw,
  }
}
