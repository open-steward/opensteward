/**
 * LogiCommerce physical location → canonical Location.
 *
 * Source: GET /physicalLocations and GET /physicalLocations/{id}
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=physicalLocations&languageId=2).
 * Documented example: `"ACTIVE" : true, "ADDRESS" :"Bisbe Torres i Bages, 3",
 * "CITY" :"Igualada", "COUNTRYCODE" :"ES", "ID" : 1, "NAME" :"TLG Commerce",
 * "PHONE" :"123456789", "POSTALCODE" :"08700", "STATE" :"Barcelona"`.
 */
import { Iso3166Alpha2 } from '@opensteward/shared'
import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'
import { requireId } from '../languages'

export interface RawLogicommercePhysicalLocation {
  ACTIVE?: boolean
  ADDRESS?: string
  CITY?: string
  COUNTRYCODE?: string
  ID?: number
  NAME?: string
  PHONE?: string
  POSTALCODE?: string
  STATE?: string
  [key: string]: unknown
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformLogicommerceLocation(raw: RawLogicommercePhysicalLocation): Location {
  const id = requireId('physical location', raw.ID)
  if (typeof raw.NAME !== 'string') {
    throw new Error(`LogiCommerce physical location ${id} has no NAME`)
  }
  const out: Location = { id, name: raw.NAME, metadata: { ...raw } }
  if (typeof raw.ACTIVE === 'boolean') out.active = raw.ACTIVE
  const phone = str(raw.PHONE)
  if (phone) out.phone = phone
  const address: Address = {}
  const line1 = str(raw.ADDRESS)
  if (line1) address.line1 = line1
  const city = str(raw.CITY)
  if (city) address.city = city
  const region = str(raw.STATE)
  if (region) address.region = region
  const postalCode = str(raw.POSTALCODE)
  if (postalCode) address.postalCode = postalCode
  const country = str(raw.COUNTRYCODE)
  if (country && Iso3166Alpha2.safeParse(country).success) address.country = country
  if (Object.keys(address).length > 0) out.address = address
  return out
}
