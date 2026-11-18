/**
 * GOFRUGAL Item stock (embedded in `GET /items`) → canonical InventoryLevel[].
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 *
 * There is no separate inventory endpoint — stock is reported per
 * `(item, location)` inline on the item object as a `stock[]` array (see
 * ../transform/product.ts for the raw shape). Read-only: GOFRUGAL documents
 * no stock-adjustment endpoint, so `adjustInventoryLevel` / `setInventoryLevel`
 * are not implemented.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawGofrugalItem } from './product'

export function transformInventoryLevels(raw: RawGofrugalItem): InventoryLevel[] {
  return (raw.stock ?? []).map((entry, index) => {
    if (entry.stock == null) {
      throw new Error(
        `GOFRUGAL item ${raw.itemId} stock entry ${index} is missing "stock" — cannot report an inventory level.`,
      )
    }
    return {
      id: `${raw.itemId}:${raw.locationId}:${index}`,
      variantId: `${raw.itemId}:default`,
      locationId: String(raw.locationId),
      // A genuinely negative on-hand count is real data the schema's
      // `.min(0)` can't carry — clamped, not fabricated from an absent field
      // (that case throws above instead).
      available: Math.max(0, Math.round(entry.stock)),
      metadata: { ...entry, itemId: raw.itemId, locationId: raw.locationId },
    }
  })
}
