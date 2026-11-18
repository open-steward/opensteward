/**
 * Transform Revel Systems Vendor resource → canonical Supplier.
 *
 * Revel calls purchasing contacts "Vendors".
 * Endpoint:  GET /resources/Vendor/
 *
 * Key fields:
 *   id, name, email, phone, active,
 *   contact_name, address, city, state, zip, country
 *
 * Note: Revel does not expose lead_time_days or default currency at the
 * Vendor level in the public REST API — those fields are omitted.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

export interface RawRevelVendor {
  /** Auto-increment PK. */
  id: number | string
  /** Vendor / supplier company name. */
  name?: string
  /** Billing/contact email. */
  email?: string | null
  /** Contact phone number. */
  phone?: string | null
  /** Primary contact person. */
  contact_name?: string | null
  /** Whether vendor is active. */
  active?: boolean | number | string | null
  /** Street address. */
  address?: string | null
  /** City. */
  city?: string | null
  /** State/province. */
  state?: string | null
  /** Postal / ZIP code. */
  zip?: string | null
  /** Country. */
  country?: string | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawRevelVendor): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email) ?? undefined,
    phone: pickStr(raw.phone) ?? undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'revel-systems',
    metadata: strMap({
      contact_name: raw.contact_name,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      zip: raw.zip,
      country: raw.country,
    }),
    raw,
  }
}
