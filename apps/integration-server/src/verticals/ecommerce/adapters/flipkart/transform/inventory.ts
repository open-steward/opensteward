/**
 * Flipkart Listings v3 → canonical InventoryLevel.
 *
 * Inventory is exposed through the Listing Management API. The
 * `POST /listings/v3/details` endpoint returns per-location stock for each
 * SKU, including the location id and the `inventory` (non-negative integer
 * representing the sellable quantity at that location).
 *
 * Because Flipkart has no dedicated GET-inventory-levels endpoint, this
 * transform is driven by the listing-details response. The canonical id is
 * synthesised as `${skuId}:${locationId}`.
 *
 * Docs: https://seller.flipkart.com/api-docs/listing-api-docs/LMAPIRef.html
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFlipkartListingLocation {
  id: string
  status?: string
  inventory?: number
  [key: string]: unknown
}

export interface RawFlipkartListingDetail {
  listing_id?: string
  product_id?: string
  sku_id?: string
  product_title?: string
  listing_status?: string
  locations?: RawFlipkartListingLocation[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Project one Flipkart listing-location pair into a canonical InventoryLevel.
 */
export function transformInventoryLevel(
  listing: RawFlipkartListingDetail,
  location: RawFlipkartListingLocation,
): InventoryLevel {
  const skuId = listing.sku_id ?? listing.listing_id ?? listing.product_id ?? 'unknown'
  const locationId = location.id

  return {
    id: `${skuId}:${locationId}`,
    variantId: skuId,
    locationId,
    available: location.inventory ?? 0,
    metadata: {
      listingId: listing.listing_id,
      productId: listing.product_id,
      skuId: listing.sku_id,
      listingStatus: listing.listing_status,
      locationStatus: location.status,
      raw: listing,
    },
  }
}

/**
 * Expand all location entries from a listing-details response into canonical
 * InventoryLevel records.
 */
export function transformInventoryLevels(
  listings: RawFlipkartListingDetail[],
): InventoryLevel[] {
  const levels: InventoryLevel[] = []
  for (const listing of listings) {
    for (const location of listing.locations ?? []) {
      levels.push(transformInventoryLevel(listing, location))
    }
  }
  return levels
}
