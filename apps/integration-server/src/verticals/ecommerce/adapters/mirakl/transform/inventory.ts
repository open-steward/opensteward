/**
 * Mirakl Offer quantity → canonical InventoryLevel.
 *
 * Mirakl has no dedicated seller-facing inventory list endpoint. Stock for
 * seller offers is embedded in the GET /api/offers list response as
 * `quantity` (available stock) on each offer object.
 *
 * Derived approach:
 *   - Source: GET /api/offers — list all offers for the connected shop.
 *   - Each offer's `quantity` field becomes `InventoryLevel.available`.
 *   - `offer_id` is used as `variantId`; Mirakl has a single synthetic
 *     location ("default"), so `locationId` is always "default".
 *   - `id` is synthesised as `${offer_id}:default` (no native inventory id).
 *
 * Write: stock updates are file-import only (POST /api/offers/stock/imports).
 * The adapter therefore does not implement adjustInventoryLevel or
 * setInventoryLevel for Mirakl.
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/offers
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawMiraklOffer } from './product'

export type { RawMiraklOffer }

export function transformOfferToInventoryLevel(
  raw: RawMiraklOffer,
  locationId = 'default',
): InventoryLevel {
  const offerId = String(raw.offer_id ?? raw.shop_sku ?? '')
  const available = raw.quantity != null && raw.quantity >= 0 ? raw.quantity : 0

  return {
    id: `${offerId}:${locationId}`,
    variantId: offerId,
    locationId,
    available,
    updatedAt: toIsoDatetime(raw.update_date) ?? raw.update_date ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
