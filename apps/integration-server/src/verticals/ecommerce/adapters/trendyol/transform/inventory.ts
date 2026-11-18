/**
 * Trendyol stock → canonical InventoryLevel.
 *
 * Trendyol does not expose a separate inventory ledger endpoint. Stock
 * quantities are managed via the price-and-inventory batch update endpoint:
 *   POST /integration/product/sellers/{sellerId}/products/price-and-inventory
 *   Body: { items: [{ barcode, quantity, salePrice, listPrice }] }
 *
 * After a stock update the adapter reads back the updated product to
 * construct the canonical InventoryLevel. Since Trendyol has no concept of
 * locations, we use a synthetic "default" location to keep the interface
 * consistent with platforms that do support multi-location inventory.
 *
 * The canonical `available` quantity maps directly from `quantity` on the
 * product filter response.
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/product-api-endpoint
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawTrendyolStockItem {
  /** Barcode is the primary product/variant identifier. */
  barcode: string
  quantity?: number | null
  lastModifiedDate?: number | null
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawTrendyolStockItem): InventoryLevel {
  const variantId = raw.barcode
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: Math.max(raw.quantity ?? 0, 0),
    updatedAt: toIsoDatetime(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
