/**
 * Newegg Warehouse → canonical Location.
 *
 * Newegg's Seller Management API provides a "Get Warehouse List" endpoint
 * that returns seller-fulfilled warehouse data.
 *
 * Docs: https://developer.newegg.com/newegg_marketplace_api/seller_management/get-warehouse-list/
 *
 * GET /sellermgmt/seller/warehouse?sellerid={sellerid}
 * Rate limit: 10 req/hr
 *
 * Response envelope:
 *   {
 *     IsSuccess: string,
 *     OperationType: 'GetSellerWarehouseResponse',
 *     SellerID: string,
 *     ResponseDate: string,
 *     ResponseBody: {
 *       WarehouseList: {
 *         Warehouse: RawNeweggWarehouse[]
 *       }
 *     }
 *   }
 *
 * Note: Newegg's API returns only country code, status, and shipping
 * destinations per warehouse — no street address or warehouse name is
 * available from this endpoint.
 */

import type { Location } from '../../../schema/location'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggWarehouse {
  /** ISO 3-digit country code, e.g. 'USA'. */
  WarehouseLocation?: string
  /** 0 = Inactive, 1 = Active */
  Status?: number
  /** ISO 3-digit country codes this warehouse ships to. */
  ShippingDestination?: string[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Newegg Warehouse → canonical Location.
 *
 * Newegg warehouses are identified by their country code. Since Newegg
 * does not expose a unique warehouse ID, we use the country code as the id.
 * If the seller has multiple warehouses in the same country the API merges
 * them into a single entry by location code.
 */
export function transformLocation(raw: RawNeweggWarehouse): Location {
  const country = raw.WarehouseLocation ?? 'UNKNOWN'

  return {
    id: country,
    name: `Newegg Warehouse (${country})`,
    active: raw.Status === 1,
    address: country !== 'UNKNOWN'
      ? { country }
      : undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
