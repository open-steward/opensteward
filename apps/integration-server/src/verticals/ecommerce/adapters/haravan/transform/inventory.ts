/**
 * Haravan variant inventory → canonical InventoryLevel.
 *
 * Haravan's read side (`variants[].inventory_advance`, embedded on both the
 * Product and standalone Variant payloads) reports `qty_available`,
 * `qty_onhand`, `qty_commited` and `qty_incoming` as a single SHOP-WIDE
 * aggregate — it does not say which location(s) the stock sits at, so there
 * is no location-scoped read endpoint this adapter can honestly map to the
 * canonical `InventoryLevel.locationId` (a real field, required). Because of
 * that, `listInventoryLevels`/`getInventoryLevel` are declared unavailable in
 * metadata.ts and this transform is used ONLY on the write path: after
 * `POST /inventories/adjustorset.json` the adapter re-fetches
 * `GET /variants/{id}.json` and hands the caller's own `locationId` (supplied
 * on the write call, never guessed here) plus the platform's fresh count to
 * this function.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/products/ (variant shape),
 *       https://docs.haravan.com/docs/omni-apis/inventory-adjustment/
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawHaravanVariant } from './product'

export function transformInventoryLevel(
  variant: RawHaravanVariant,
  locationId: string,
): InventoryLevel {
  const advance = variant.inventory_advance
  const available = advance?.qty_available ?? variant.inventory_quantity
  if (available == null) {
    throw new Error(
      `Haravan variant ${variant.id} reports no inventory_advance/inventory_quantity — cannot report an InventoryLevel without a real available count.`,
    )
  }
  return {
    id: `${variant.id}:${locationId}`,
    variantId: String(variant.id),
    locationId,
    available,
    committed: advance?.qty_commited ?? undefined,
    incoming: advance?.qty_incoming ?? undefined,
    onHand: advance?.qty_onhand ?? undefined,
    updatedAt: variant.updated_at,
    metadata: variant as unknown as Record<string, unknown>,
  }
}
