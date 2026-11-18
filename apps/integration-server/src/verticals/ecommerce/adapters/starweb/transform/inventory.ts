/**
 * Starweb Variant stock → canonical InventoryLevel.
 *
 * Starweb does not expose a dedicated inventory ledger endpoint. Stock is
 * tracked as `stockQuantity` on each product variant. There is no
 * multi-location concept — the entire shop is a single virtual warehouse.
 *
 * We synthesise a single "default" location and build the canonical
 * InventoryLevel from the variant's `stockQuantity`. The composite `id`
 * follows the `${variantId}:${locationId}` convention.
 *
 * Docs: https://api-docs.starweb.se/
 */

import type { InventoryLevel } from '../../../schema/inventory'

export const STARWEB_LOCATION_ID = 'default'

export interface RawStarwebVariantStock {
  variantId: number | string
  stockQuantity?: number | null
  modifiedAt?: string | null
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawStarwebVariantStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${raw.variantId}`
  const locationId = STARWEB_LOCATION_ID
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: Math.max(0, raw.stockQuantity ?? 0),
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
    },
  }
}
