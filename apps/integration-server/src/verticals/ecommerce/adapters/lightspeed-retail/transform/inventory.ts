/**
 * Lightspeed Retail ItemShop → canonical InventoryLevel.
 *
 * Lightspeed tracks per-shop inventory via `ItemShop` records. Each has an
 * `itemID`, `shopID`, and `qoh` (quantity on hand). The canonical id is
 * synthesized as `{itemID}:{shopID}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { lsDecimalToNumber } from './product'

export interface RawLightspeedItemShop {
  itemShopID?: string
  itemID: string
  shopID: string
  qoh?: string
  backorder?: string
  componentQoh?: string
  reorderPoint?: string
  reorderLevel?: string
  timeStamp?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawLightspeedItemShop): InventoryLevel {
  const variantId = raw.itemID
  const locationId = raw.shopID
  const available = lsDecimalToNumber(raw.qoh)

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: Number.isNaN(available) ? 0 : available,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
