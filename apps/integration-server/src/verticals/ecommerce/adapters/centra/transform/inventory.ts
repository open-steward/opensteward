/**
 * Centra Order API Stock → canonical InventoryLevel.
 *
 * Centra's GET /stock endpoint returns rows keyed by stock item (variant +
 * size level). Each row has:
 *  - `sku`               — primary SKU
 *  - `productId`         — parent product id
 *  - `variantId`         — variant id
 *  - `stockItemId`       — size-level stock item id (most specific)
 *  - `physicalStock`     — total physical stock
 *  - `allocatedStock`    — stock allocated to pending shipments
 *  - `availableStock`    — physicalStock − allocatedStock
 *
 * Centra does not tie stock to locations at this API level; we use the
 * synthetic location id `'default'` to satisfy the canonical schema.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawCentraStockItem {
  sku?: string | null
  productId?: number | string
  variantId?: number | string
  stockItemId?: number | string
  physicalStock?: number
  allocatedStock?: number
  availableStock?: number
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawCentraStockItem,
  locationId = 'default',
): InventoryLevel {
  // Use stockItemId as the variant identifier — it is the most granular.
  const variantId = String(raw.stockItemId ?? raw.variantId ?? raw.productId ?? '')
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.availableStock ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
