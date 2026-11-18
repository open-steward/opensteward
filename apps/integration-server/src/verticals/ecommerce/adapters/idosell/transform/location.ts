/**
 * IdoSell WMS location → canonical Location.
 *
 * Shape verified against https://idosell.readme.io/reference/wmslocationsget
 * (`GET /wms/locations`): `locationId`, `locationName`, `locationPath`,
 * `locationCode`, `stockId`, `parentId`, `products[]`. No address field is
 * documented, and no active/fulfillment-center flag is documented either —
 * both are left off rather than guessed (Shopify's Location analogue
 * assumes "active ⇒ fulfillment centre"; IdoSell's response carries nothing
 * to base that inference on).
 */

import type { Location } from '../../../schema/location'

export interface RawIdosellWmsLocation {
  locationId: number | string
  locationName?: string
  locationPath?: string
  locationCode?: string
  stockId?: number | string
  parentId?: number | string
}

export function transformLocation(raw: RawIdosellWmsLocation): Location {
  return {
    id: String(raw.locationId),
    name: raw.locationName || raw.locationCode || String(raw.locationId),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
