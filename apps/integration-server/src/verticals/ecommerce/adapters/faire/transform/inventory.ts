/**
 * Faire variant stock → canonical InventoryLevel.
 *
 * ExternalProductVariantV2 carries `available_quantity`: "If set, the number of
 * units available for sale. If not set in the response, the brand has not set
 * their inventory levels in Faire." A variant without it has no inventory level,
 * so it yields none rather than a 0.
 *
 * The External API has no location or warehouse concept (no location path or
 * field in the spec), while the canonical level requires a `locationId`. Every
 * level is keyed to one constant location, the vertical's convention for
 * single-location platforms.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'
import { faireVariantKey, type RawFaireVariant } from './product'

/** The one location Faire stock is reported against. */
export const FAIRE_DEFAULT_LOCATION_ID = 'faire:default'

/**
 * `productId` is the variant's product (the ExternalProductV2 it was read
 * from): the level's `variantId` is the canonical `productId:variantId` that
 * ProductVariant.id carries, so levels join to variants.
 */
export function transformInventoryLevel(
  raw: RawFaireVariant,
  productId: string,
): InventoryLevel | undefined {
  if (raw.available_quantity == null) return undefined
  const variantId = faireVariantKey(productId, raw.id)
  return {
    id: `${variantId}:${FAIRE_DEFAULT_LOCATION_ID}`,
    variantId,
    locationId: FAIRE_DEFAULT_LOCATION_ID,
    available: Math.max(0, raw.available_quantity),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
