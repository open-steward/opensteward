/**
 * Cafe24 shipping origin → canonical Location.
 *
 * Cafe24 documents no "warehouses" resource. Its stock locations are shipping
 * origins, whose documented example rows are warehouses
 * (`origin_name: "Dongjak-gu Warehouse"`):
 *
 *   GET /api/v2/admin/shippingorigins                → { shippingorigins: [...] }
 *   GET /api/v2/admin/shippingorigins/{origin_code}  → { shippingorigin: {...} }
 *
 * Documented fields (https://apidocs.cafe24.com/en/docs/admin/get-shippingorigins):
 *   origin_code "Shipping origin code", origin_name "Shipping origin name",
 *   default "Check whether the shipping origin is set as default T: Use F: Do not use",
 *   country_code "Country code", zipcode "Zipcode", address1 "Address 1",
 *   address2 "Address 2", contact "primary contact", secondary_contact
 *   "secondary contact", variants "Information of items in a shipping origin".
 *
 * No documented field says whether an origin is active or fulfils orders, so
 * `active` and `isFulfillmentCenter` are left out rather than guessed.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Cafe24 shape ──────────────────────────────────────────────────────────

export interface RawCafe24ShippingOrigin {
  origin_code: string
  /** Documented as 1–50 characters, so always present. */
  origin_name: string
  default?: string | null
  country_code?: string | null
  zipcode?: string | null
  address1?: string | null
  address2?: string | null
  contact?: string | null
  secondary_contact?: string | null
  variants?: string[] | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawCafe24ShippingOrigin): Address | undefined {
  const address: Address = {}
  if (raw.address1) address.line1 = raw.address1
  if (raw.address2) address.line2 = raw.address2
  if (raw.zipcode) address.postalCode = raw.zipcode
  if (raw.country_code) address.country = raw.country_code
  return Object.keys(address).length > 0 ? address : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawCafe24ShippingOrigin): Location {
  const location: Location = {
    id: raw.origin_code,
    name: raw.origin_name,
    metadata: {
      originCode: raw.origin_code,
      ...(raw.default != null ? { default: raw.default } : {}),
      ...(raw.secondary_contact != null ? { secondaryContact: raw.secondary_contact } : {}),
      ...(raw.variants != null ? { variants: raw.variants } : {}),
    },
  }
  const address = mapAddress(raw)
  if (address) location.address = address
  if (raw.contact) location.phone = raw.contact
  return location
}
