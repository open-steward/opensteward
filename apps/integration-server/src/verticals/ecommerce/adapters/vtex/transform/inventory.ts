/**
 * VTEX Inventory (Logistics) → canonical InventoryLevel.
 *
 * VTEX manages inventory through the Logistics API. Warehouse stock is
 * accessible at:
 *   GET /api/logistics/pvt/inventory/skus/{skuId}
 *
 * The response includes a `balance` array with per-warehouse quantities. Each
 * warehouse maps to a canonical Location; the canonical InventoryLevel links
 * a variant (SKU) to a location (warehouse) with an `available` count.
 *
 * Key quantities:
 *  - `totalQuantity` — total units physically in the warehouse.
 *  - `reservedQuantity` — units reserved for open orders.
 *  - `hasUnlimitedQuantity` — if true, available is treated as infinite.
 *
 * `available = totalQuantity - reservedQuantity` (when not unlimited).
 *
 * Docs: https://developers.vtex.com/docs/api-reference/logistics-api
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexWarehouseBalance {
  warehouseId: string
  warehouseName?: string | null
  totalQuantity?: number | null
  reservedQuantity?: number | null
  hasUnlimitedQuantity?: boolean | null
  timeToRefill?: string | null
  dateOfSupplyUtc?: string | null
  [key: string]: unknown
}

export interface RawVtexInventory {
  skuId: string
  balance?: RawVtexWarehouseBalance[]
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  warehouseBalance: RawVtexWarehouseBalance,
  skuId: string,
): InventoryLevel {
  const total = warehouseBalance.totalQuantity ?? 0
  const reserved = warehouseBalance.reservedQuantity ?? 0
  const unlimited = warehouseBalance.hasUnlimitedQuantity === true
  const available = unlimited ? 9_999_999 : Math.max(0, total - reserved)

  return {
    id: `${skuId}:${warehouseBalance.warehouseId}`,
    variantId: skuId,
    locationId: warehouseBalance.warehouseId,
    available,
    metadata: warehouseBalance as unknown as Record<string, unknown>,
  }
}

/**
 * Transform the full VTEX inventory response into one InventoryLevel per
 * warehouse that has a balance entry.
 */
export function transformInventoryLevels(raw: RawVtexInventory): InventoryLevel[] {
  if (!raw.balance || raw.balance.length === 0) return []
  return raw.balance.map((b) => transformInventoryLevel(b, raw.skuId))
}
