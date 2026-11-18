/**
 * Magento MSI source-item → canonical InventoryLevel.
 *
 * Magento 2.3+ ships Multi-Source Inventory (MSI): stock levels live in
 * `/V1/inventory/source-items` keyed by `(sku, source_code)`. Each
 * source-item has a `quantity` and `status` (1 = in stock).
 *
 * Canonical `variantId` uses the SKU (same id convention as the
 * product/variant transform); `locationId` uses the source_code
 * (same as the location transform). The synthesized canonical id is
 * `${sku}:${source_code}` so callers can round-trip.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawMagentoSourceItem {
  sku: string
  source_code: string
  quantity: number
  status?: number // 1 = in stock, 0 = out of stock
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawMagentoSourceItem): InventoryLevel {
  return {
    id: `${raw.sku}:${raw.source_code}`,
    variantId: raw.sku,
    locationId: raw.source_code,
    available: raw.quantity,
    metadata: raw as Record<string, unknown>,
  }
}
