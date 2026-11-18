import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Apicbase outlet — the F&B platform's equivalent of a location/warehouse.
 *
 * List endpoint:   GET /api/v2/accounts/outlets/      (reference/get-outlets)
 * Detail endpoint: GET /api/v2/accounts/outlets/{outlet_id}/ (reference/get-outlet-details)
 *
 * Key fields (snake_case, DRF-style):
 *   id           — the outlet's id: the `{outlet_id}` of every per-outlet
 *                  path, and what stock levels and transfers name as their
 *                  location. Outlets carry no `uid`.
 *   name         — outlet display name
 *   contact      — the outlet's contact details. Its address is
 *                  `contact.address` { street, number, postal_code, city,
 *                  country }: "The outlet's general contact information goes
 *                  in the `contact` object (renamed from `supplier` in v1).
 *                  Address fields must be nested under `contact.address`"
 *                  (reference/create-outlet; reference/edit-outlet says the
 *                  same). Those pages' responses show the outlet with it. The
 *                  GET examples show a shorter `contact` with no address, so
 *                  an outlet read there may come back with none.
 *
 * `country` is free text in every documented example ("Belgium",
 * "My Country"), while the canonical address takes an ISO 3166-1 alpha-2
 * code, so a country is mapped only when it already is one; otherwise it is
 * kept as metadata.country.
 */
export interface RawApicbaseOutletAddress {
  street?: string | null
  number?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawApicbaseOutlet {
  /** The outlet's id, as GET /accounts/outlets/ documents it (reference/get-outlets). */
  id: string
  name?: string
  /** The outlet's contact details; `contact: null` is a cleared contact (reference/edit-outlet). */
  contact?: {
    address?: RawApicbaseOutletAddress | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

export function transformLocation(raw: RawApicbaseOutlet): Location {
  const id = pickStr(raw.id) ?? ''
  const a = raw.contact?.address
  const country = pickStr(a?.country)
  const isoCountry = country !== undefined && isIso3166Alpha2(country) ? country : undefined
  // Street and house number are separate fields. line1 joins them street
  // first, the order of the Brussels address in reference/get-outlet-details
  // ("street": "Rue de la Loi", "number": "1"); the docs prescribe no format.
  const line1 = [pickStr(a?.street), pickStr(a?.number)].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: undefined,
    type: 'store',
    parentLocationId: undefined,
    address: a ? {
      line1: line1 || undefined,
      line2: undefined,
      city: pickStr(a.city),
      region: undefined,
      country: isoCountry,
      postalCode: pickStr(a.postal_code),
    } : undefined,
    isActive: true,
    platform: 'apicbase',
    metadata: strMap({ country: isoCountry ? undefined : country }),
    raw,
  }
}
