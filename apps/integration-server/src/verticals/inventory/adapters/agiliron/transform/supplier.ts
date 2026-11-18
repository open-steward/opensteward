import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * Raw shape returned by GET /Vendor in Agiliron API v4.0.
 *
 * Field reference: https://api.agiliron.com/docs/add-vendor-1
 *                  https://learn.agiliron.com/docs/vendor-form-fields
 *
 * The response envelope is:
 *   { Vendors: { Vendor: RawAgilironVendor[] }, TotalRecords, CurrentPage, ... }
 */
export interface RawAgilironVendor {
  VendorId?: string
  vendor_id?: string
  VendorName?: string
  vendor_name?: string
  Email?: string
  Telephone?: string
  Phone?: string
  OtherPhone?: string
  OtherEmail?: string
  DefaultCurrency?: string
  Category?: string
  Rating?: string
  Type?: string
  Website?: string
  Street?: string
  City?: string
  State?: string
  Postcode?: string
  Country?: string
  [key: string]: unknown
}

export function transformVendor(raw: RawAgilironVendor): Supplier {
  const id = pickStr(raw.VendorId ?? raw.vendor_id) ?? ''
  const name = pickStr(raw.VendorName ?? raw.vendor_name) ?? ''
  const email = pickStr(raw.Email ?? raw.OtherEmail)
  const phone = pickStr(raw.Telephone ?? raw.Phone ?? raw.OtherPhone)

  const addressParts: Record<string, string> = {}
  if (raw.Street) addressParts['street'] = String(raw.Street)
  if (raw.City) addressParts['city'] = String(raw.City)
  if (raw.State) addressParts['state'] = String(raw.State)
  if (raw.Country) addressParts['country'] = String(raw.Country)
  if (raw.Postcode) addressParts['postcode'] = String(raw.Postcode)

  return {
    id,
    externalId: id,
    name,
    email,
    phone,
    defaultCurrency: pickStr(raw.DefaultCurrency),
    isActive: true,
    platform: 'agiliron',
    metadata: strMap({
      category: raw.Category,
      rating: raw.Rating,
      type: raw.Type,
      website: raw.Website,
      ...addressParts,
    }),
    raw,
  }
}

/** Agiliron GET /Vendor response envelope */
export interface AgilironVendorEnvelope {
  Vendors?: { Vendor?: RawAgilironVendor[] }
  TotalRecords?: number
  CurrentPage?: number
  TotalPages?: number
  PageSize?: number
}
