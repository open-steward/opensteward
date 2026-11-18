/**
 * Etsy Listing Inventory → canonical InventoryLevel.
 *
 * Etsy's inventory model is listing-centric. Each listing has an inventory
 * resource at `GET /listings/{listingId}/inventory` which returns:
 *
 *   {
 *     products: [
 *       {
 *         product_id: number,
 *         sku: string,
 *         offerings: [
 *           {
 *             offering_id: number,
 *             price: { amount, divisor, currency_code },
 *             quantity: number,
 *             is_enabled: boolean
 *           }
 *         ],
 *         property_values: [...]
 *       }
 *     ],
 *     listing_id: number
 *   }
 *
 * Each "product" is a variation combination (or the single default product
 * for listings without variations). Each product has one or more "offerings"
 * which carry the quantity.
 *
 * For the canonical InventoryLevel:
 *  - `id` = `${listingId}:${productId}`
 *  - `variantId` = `${listingId}` (no separate variant concept)
 *  - `locationId` = `etsy-default` (Etsy has no location model)
 *  - `available` = sum of offering quantities for that product
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawEtsyOffering {
  offering_id: number
  price?: { amount: number; divisor: number; currency_code: string }
  quantity: number
  is_enabled?: boolean
  [key: string]: unknown
}

export interface RawEtsyInventoryProduct {
  product_id: number
  sku?: string
  offerings?: RawEtsyOffering[]
  property_values?: unknown[]
  is_deleted?: boolean
  [key: string]: unknown
}

export interface RawEtsyInventory {
  products?: RawEtsyInventoryProduct[]
  listing_id?: number
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'etsy-default'

/**
 * Transform a single Etsy inventory product into a canonical InventoryLevel.
 */
export function transformInventoryLevel(
  listingId: string,
  product: RawEtsyInventoryProduct,
): InventoryLevel {
  const offerings = product.offerings ?? []
  const available = offerings.reduce((sum, o) => sum + (o.quantity ?? 0), 0)

  return {
    id: `${listingId}:${product.product_id}`,
    variantId: listingId,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: product as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a full Etsy inventory response into canonical InventoryLevel[].
 */
export function transformInventoryLevels(
  listingId: string,
  inventory: RawEtsyInventory,
): InventoryLevel[] {
  const products = inventory.products ?? []
  return products.map((p) => transformInventoryLevel(listingId, p))
}
