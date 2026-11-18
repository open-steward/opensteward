/**
 * Shoper Product Stock → canonical InventoryLevel.
 *
 * Shoper does not have a separate inventory_levels endpoint.  Stock
 * quantities are stored on the product/variant `stock` object and are
 * per-warehouse when warehouses are enabled.
 *
 * The canonical InventoryLevel id is synthesised as
 * `{productId}:{warehouseId}` using a composite key convention.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

/** Minimal stock object embedded on a product/variant. */
export interface RawShoperProductStock {
  product_id?: number | string
  /** Available stock quantity. */
  stock?: number | null
  warehouse_id?: number | string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

const DEFAULT_WAREHOUSE = 'default'

export function transformInventoryLevel(
  raw: RawShoperProductStock,
  warehouseId?: string,
): InventoryLevel {
  const productId = String(raw.product_id ?? '')
  const locationId = warehouseId ?? (raw.warehouse_id != null ? String(raw.warehouse_id) : DEFAULT_WAREHOUSE)
  const available = raw.stock ?? 0

  return {
    id: `${productId}:${locationId}`,
    variantId: productId,
    locationId,
    available: Math.max(0, Math.round(available)),
    committed: undefined,
    incoming: undefined,
    onHand: undefined,
    updatedAt: raw.edit_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
