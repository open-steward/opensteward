import { Iso3166Alpha2 } from '@opensteward/shared'
import type { Location } from '../../../schema/location'
import type { LocationType } from '../../../schema/shared'
import { pickBool, pickNum, pickStr, requireId, strMap } from './shared'

/**
 * Erplain v2 `Location`, as selected by LOCATION_FIELDS in ../index.ts.
 *
 * https://erplain.readme.io/v2.0/reference/locations-queries, "Available fields":
 *   id            Int          "Unique identifier of the location."
 *   label         String       "Label of the location."
 *   active        Boolean      "Whether the location is active."
 *   type          LocationType "Type of location (store, warehouse)."
 *   phone         String       "Phone number of the location."
 *   shipping_cost Float        "Shipping cost for this location."
 *   address       Address      "Address of the location."
 * and the `LocationType` enum: `store`, `warehouse`, `subcontractor`
 * ("External manufacturing or processing location.").
 *
 * Address fields, https://erplain.readme.io/v2.0/reference/addresses-queries:
 *   country "Country code (e.g. FR, US).", address_1 "Address line 1.",
 *   address_2 "Address line 2.", postal_code, city, state "State / Region."
 */
export interface RawErplainLocation {
  id: number | string | null
  label?: string | null
  active?: boolean | number | null
  type?: string | null
  phone?: string | null
  shipping_cost?: number | null
  address?: {
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
  } | null
}

function mapType(t: string | null | undefined): LocationType {
  switch (t) {
    case 'warehouse':
      return 'warehouse'
    case 'store':
      return 'store'
    // `subcontractor` has no canonical counterpart.
    default:
      return 'unknown'
  }
}

export function transformLocation(raw: RawErplainLocation): Location {
  const id = requireId(raw.id, 'location')
  const active = pickBool(raw.active)
  if (active === undefined) throw new Error(`erplain location ${id} has no active flag`)
  const a = raw.address
  const country = Iso3166Alpha2.safeParse(a?.country)
  return {
    id,
    externalId: id,
    name: pickStr(raw.label) ?? '',
    type: mapType(raw.type),
    address: a
      ? {
          line1: pickStr(a.address_1),
          line2: pickStr(a.address_2),
          city: pickStr(a.city),
          region: pickStr(a.state),
          postalCode: pickStr(a.postal_code),
          country: country.success ? country.data : undefined,
        }
      : undefined,
    isActive: active,
    platform: 'erplain',
    metadata: strMap({
      type: raw.type,
      phone: raw.phone,
      shipping_cost: pickNum(raw.shipping_cost),
    }),
    raw,
  }
}
