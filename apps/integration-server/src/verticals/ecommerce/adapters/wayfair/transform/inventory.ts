/**
 * Wayfair Inventory → canonical InventoryLevel.
 *
 * Wayfair suppliers submit inventory feeds via the `saveInventory` GraphQL
 * mutation. The mutation accepts an array of inventory items per supplier or
 * warehouse.
 *
 * Each inventory item has:
 *   supplierPartNumber — the supplier's SKU (maps to variantId)
 *   quantityOnHand     — physical quantity available (maps to available)
 *   itemNextAvailabilityDate — optional ISO-8601 date for back-in-stock
 *
 * The mutation response:
 *   handle      — async job id
 *   status      — PROCESSING | COMPLETE | ERROR
 *   itemCount   — total line items in the feed
 *   errorCount  — number of items with errors
 *   errors[]    — { key, message }
 *
 * Because inventory is submitted as a batch feed (not per-item), we transform
 * the individual input items for canonical representation and also expose the
 * feed response. Wayfair does not expose a GET inventory endpoint — the feed
 * is write-only.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWayfairInventoryItem {
  /** Supplier's part number / SKU. */
  supplierPartNumber: string
  /** Quantity physically on hand and available to ship. */
  quantityOnHand: number
  /** Optional ISO-8601 date when the item will be back in stock. */
  itemNextAvailabilityDate?: string | null
  /** Supplier or warehouse id used to scope the inventory level. */
  supplierId?: string | number | null
  warehouseId?: string | number | null
  [key: string]: unknown
}

export interface RawWayfairInventoryFeedResult {
  handle?: string | null
  status?: string | null
  itemCount?: number | null
  errorCount?: number | null
  errors?: Array<{ key?: string | null; message?: string | null }> | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform a single Wayfair inventory item into the canonical InventoryLevel.
 *
 * @param item      Raw inventory item from the feed input or a synthetic read.
 * @param locationId  Wayfair supplierId or warehouseId that scopes this level.
 */
export function transformInventoryLevel(
  item: RawWayfairInventoryItem,
  locationId?: string,
): InventoryLevel {
  const resolvedLocationId =
    locationId ??
    (item.supplierId != null ? String(item.supplierId) : null) ??
    (item.warehouseId != null ? String(item.warehouseId) : 'default')

  const variantId = item.supplierPartNumber

  return {
    id: `${variantId}:${resolvedLocationId}`,
    variantId,
    locationId: resolvedLocationId,
    available: Math.max(0, item.quantityOnHand),
    onHand: Math.max(0, item.quantityOnHand),
    metadata: item as unknown as Record<string, unknown>,
  }
}

/**
 * Convert a canonical InventoryLevel into a Wayfair inventory feed item
 * suitable for inclusion in the `saveInventory` mutation variables.
 */
export function untransformInventoryLevel(
  level: Partial<InventoryLevel>,
): RawWayfairInventoryItem {
  return {
    supplierPartNumber: level.variantId ?? '',
    quantityOnHand: level.available ?? level.onHand ?? 0,
  }
}
