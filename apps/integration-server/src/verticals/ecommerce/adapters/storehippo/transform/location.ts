/**
 * StoreHippo `ms.store_locations` record → canonical Location.
 *
 * "Store Locations are the physical locations from where you are operating
 * your business." Fields, from the ms-store_locations reference
 * (https://help.storehippo.com/api/reference/ms-store_locations):
 *   title       "The title for the store location." (required)
 *   phone       "Contact number for the store location."
 *   address     "Address for the store location."
 *   address2    (no description)
 *   city        "City where the store is located."
 *   state       "Name of the state where the store is located."
 *   zip_code    "Zip code or postal code for the store location."
 *   country     "Country code of the country where the store is located." (ex IN)
 * `_id` is on every record in the documented responses.
 */

import type { Location } from '../../../schema/location'
import { countryCode, recordId, text } from '../values'

export interface RawStoreHippoStoreLocation {
  _id?: string
  title?: string
  email?: string
  phone?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  state_code?: string
  zip_code?: string
  country?: string
  country_name?: string
  show_on_website?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawStoreHippoStoreLocation): Location {
  const id = recordId(raw, 'store location')
  const name = text(raw.title)
  if (!name) throw new Error(`StoreHippo store location ${id} has no title`)
  const address = {
    ...(text(raw.address) ? { line1: raw.address } : {}),
    ...(text(raw.address2) ? { line2: raw.address2 } : {}),
    ...(text(raw.city) ? { city: raw.city } : {}),
    ...(text(raw.state) ? { region: raw.state } : {}),
    ...(text(raw.zip_code) ? { postalCode: raw.zip_code } : {}),
    ...(countryCode(raw.country) ? { country: raw.country } : {}),
  }
  return {
    id,
    name,
    ...(Object.keys(address).length > 0 ? { address } : {}),
    ...(text(raw.phone) ? { phone: raw.phone } : {}),
    metadata: raw as Record<string, unknown>,
  }
}
