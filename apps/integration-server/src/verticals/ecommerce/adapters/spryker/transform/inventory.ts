/**
 * Spryker concrete-product-availabilities → canonical InventoryLevel.
 *
 * Spryker Glue REST API:
 *   GET /concrete-products/{sku}/concrete-product-availabilities
 *   Response type: "concrete-product-availabilities"
 *
 * Key attribute fields: availability (boolean), quantity (integer or decimal),
 *   isNeverOutOfStock.
 *
 * Spryker manages inventory per concrete-product (SKU), not per location.
 * The canonical `locationId` is set to "default" when no location data is
 * present — Spryker's storefront API does not expose warehouse/location IDs
 * in the availability endpoint.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { JsonApiResource } from '../client'

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerAvailabilityAttributes {
  availability?: boolean
  quantity?: string | number | null
  isNeverOutOfStock?: boolean
  [key: string]: unknown
}

export type RawSprykerAvailability = JsonApiResource<RawSprykerAvailabilityAttributes>

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformAvailability(
  raw: RawSprykerAvailability,
  variantSku: string,
): InventoryLevel {
  const attrs = raw.attributes
  const qty = attrs.quantity
  const available =
    attrs.isNeverOutOfStock
      ? 9999
      : qty != null
        ? typeof qty === 'string'
          ? Math.floor(parseFloat(qty))
          : Math.floor(qty)
        : 0

  const locationId = 'default'
  return {
    id: `${variantSku}:${locationId}`,
    variantId: variantSku,
    locationId,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
