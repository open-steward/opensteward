/**
 * Coupang vendor-item stock → canonical InventoryLevel.
 *
 * GET .../marketplace/vendor-items/{vendorItemId}/inventories returns
 * `data{sellerItemId, amountInStock, salePrice, onSale}`, where "amountInStock
 * | integer | Remaining quantity of option"
 * (https://developers.coupang.com/en/api/products/query-quantitypricestatus-by-product-items).
 *
 * The stock read names no location. The location is the product's
 * "outboundShippingPlaceCode | number | Shipping location address code"
 * (https://developers.coupang.com/en/api/products/querying-product), which is
 * the id listLocations returns, so the caller passes it in.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawCoupangStockResponse {
  /** "sellerItemId | integer | Option ID" */
  sellerItemId?: number
  /** "amountInStock | integer | Remaining quantity of option" */
  amountInStock?: number
  /** "salePrice | integer | Option selling price" */
  salePrice?: number
  /** "onSale | boolean | Option sale status" */
  onSale?: boolean
  [key: string]: unknown
}

/** The canonical id: `${variantId}:${locationId}`, as the schema asks. */
export function inventoryLevelId(vendorItemId: string, locationId: string): string {
  return `${vendorItemId}:${locationId}`
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * @param raw           the documented `data` object
 * @param vendorItemId  the option the stock was read for (the path parameter)
 * @param locationId    the owning product's outboundShippingPlaceCode
 */
export function transformInventoryLevel(
  raw: RawCoupangStockResponse,
  vendorItemId: string,
  locationId: string,
): InventoryLevel {
  if (typeof raw.amountInStock !== 'number') {
    throw new Error(`Coupang stock for vendor item ${vendorItemId} has no amountInStock`)
  }
  return {
    id: inventoryLevelId(vendorItemId, locationId),
    variantId: vendorItemId,
    locationId,
    available: raw.amountInStock,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build the stock update body for the setInventoryLevel write method, which
 * this rebuild left alone (its path is undocumented; see constants.ts).
 */
export function buildStockUpdateBody(available: number): Record<string, unknown> {
  return { quantity: available }
}
