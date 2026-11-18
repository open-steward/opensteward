/**
 * Acctivate does not expose a location / warehouse endpoint through its
 * XML web-service API.  The web-service is solely designed for web-store
 * inventory synchronization (UpdateInventory push) and does not surface
 * warehouse, zone, or bin records.
 *
 * The InventoryAdapter interface makes listLocations / getLocation optional;
 * the acctivate adapter does NOT implement them.
 *
 * This file exists to satisfy the adapter file-shape convention.
 * If Acctivate ever adds a location endpoint, extend this stub.
 */
import type { Location } from '../../../schema/location'

/** Placeholder — not returned by any live Acctivate endpoint */
export interface RawAcctivateLocation {
  [key: string]: unknown
}

export function transformLocation(_raw: RawAcctivateLocation): Location {
  throw new Error('acctivate: locations are not available via the web-service API')
}
