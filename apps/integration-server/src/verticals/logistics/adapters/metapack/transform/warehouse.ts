/**
 * Metapack — Warehouse transform.
 *
 * Shipping API 1.14.0 (https://dev.metapack.com/shipping/reference/shipping/operation/getAccountWarehouses/):
 *   GET /shippingLocations, "Retrieve all warehouses associated with your
 *   Metapack shipper account." 200: an array of `ShippingLocations`
 *   { name: string, code: string }. The code is what POST /manifests takes as
 *   `shippingLocationCode`, so it is the warehouse id.
 */

import type { Warehouse } from '../../../schema/warehouse'

export interface MetapackWarehouse {
  name?: string
  code?: string
}

export function transformWarehouse(raw: MetapackWarehouse): Warehouse {
  return {
    id: raw.code,
    name: raw.name,
    code: raw.code,
    metadata: { ...raw },
  }
}
