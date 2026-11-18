/**
 * Fynd inventory article ⇄ canonical InventoryLevel.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformClient.js` — `getInventories`
 * (`GET catalog/v1.0/company/{id}/inventories`, filterable by `item_id`,
 * `size`, `store_ids`) and `updateLocationQuantity`
 * (`POST catalog/v1.0/company/{id}/store/{storeId}/identifier/{sellerIdentifier}/quantity`,
 * body `LocationQuantityRequestSchema` — an ABSOLUTE `total_quantity`, no
 * delta/adjust endpoint exists). Shape from
 * `CatalogPlatformModel.GetInventories()` (`quantities`, `store`,
 * `seller_identifier`).
 *
 * There is no single-record "get inventory by id" endpoint in the public
 * reference — every read is a filtered list. `id` is `${seller_identifier}:
 * ${store.uid}` because that pair is exactly what `updateLocationQuantity`'s
 * path needs, and both are required here (a record without a
 * `seller_identifier` cannot be looked up again or written back through the
 * only mutation endpoint this API exposes, so it is rejected rather than
 * papered over with a synthesized id).
 *
 * `available` is `quantities.sellable.count` only — the one field the
 * schema documents as "sellable" stock, matching the canonical field's own
 * description. No `?? 0` default: a record with no sellable count is a
 * server response this adapter cannot represent, so it throws rather than
 * reporting a fabricated zero.
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawFyndInventoryArticle {
  seller_identifier?: string
  quantities?: {
    sellable?: { count?: number; updated_at?: string }
    order_committed?: { count?: number }
  }
  store?: { uid?: number }
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformInventoryLevel(raw: RawFyndInventoryArticle): InventoryLevel {
  if (!raw.seller_identifier) {
    throw new Error('Fynd inventory record is missing seller_identifier')
  }
  if (raw.store?.uid == null) {
    throw new Error(`Fynd inventory record ${raw.seller_identifier} is missing store.uid`)
  }
  const available = raw.quantities?.sellable?.count
  if (available == null) {
    throw new Error(`Fynd inventory record ${raw.seller_identifier} has no quantities.sellable.count`)
  }
  const committed = raw.quantities?.order_committed?.count
  return {
    id: `${raw.seller_identifier}:${raw.store.uid}`,
    variantId: raw.seller_identifier,
    locationId: String(raw.store.uid),
    available,
    committed,
    onHand: committed != null ? available + committed : undefined,
    updatedAt: toIso(raw.quantities?.sellable?.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
