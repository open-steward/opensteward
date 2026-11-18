/**
 * X-Cart Product → canonical InventoryLevel.
 *
 * X-Cart does not have a dedicated inventory ledger endpoint — stock is
 * the `quantity` field on each product object. We synthesize a single
 * InventoryLevel per product using a `default` location, consistent with
 * how WooCommerce handles this.
 *
 * The canonical InventoryLevel id is `${productId}:default` so the product
 * id can always be recovered by splitting on `:default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { XCartProduct } from './product'

// Re-export for convenience
export type { XCartProduct }

export function transformInventoryLevel(raw: XCartProduct): InventoryLevel {
  const productId = String(raw.id)
  const variantId = `${productId}:default`
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: raw.quantity ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
