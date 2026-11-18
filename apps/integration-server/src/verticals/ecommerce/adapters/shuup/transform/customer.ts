/**
 * Shuup Contact → canonical Customer.
 *
 * Shuup calls customers "contacts" internally (`/api/v1/shuup/contact/`).
 * A contact may be a `PersonContact` (individual) or a `CompanyContact`
 * (business). Both share the same endpoint.
 *
 * The canonical customer maps:
 *  - `name` (full name for persons, company name for companies) → split into
 *    `firstName` / `lastName` for persons, or kept as `firstName` for companies.
 *  - `email` → `email`
 *  - `phone` → `phone`
 *  - `default_shipping_address` → `defaultAddress` / `addresses`
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Shuup shapes ─────────────────────────────────────────────────────────

export interface ShuupContactAddress {
  street?: string | null
  street2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface ShuupContact {
  id: number | string
  /** Full name (persons) or company name. */
  name?: string | null
  /** Used when the contact is a person contact. */
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  /** Contact type: 'PersonContact' | 'CompanyContact' */
  type?: string | null
  is_active?: boolean | null
  created_on?: string | null
  modified_on?: string | null
  default_shipping_address?: ShuupContactAddress | null
  default_billing_address?: ShuupContactAddress | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: ShuupContactAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street ?? undefined
  const line2 = raw.street2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: ShuupContact): Customer {
  // Prefer explicit first_name / last_name; fall back to splitting `name`
  let firstName: string | undefined
  let lastName: string | undefined

  if (raw.first_name || raw.last_name) {
    firstName = raw.first_name ?? undefined
    lastName = raw.last_name ?? undefined
  } else if (raw.name) {
    const parts = raw.name.trim().split(/\s+/)
    firstName = parts[0]
    lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  }

  const billing = mapAddress(raw.default_billing_address)
  const shipping = mapAddress(raw.default_shipping_address)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping && shipping !== billing) addresses.push(shipping)

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName,
    lastName,
    phone: raw.phone ?? undefined,
    acceptsMarketing: false,
    defaultAddress: billing ?? shipping,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.created_on ?? undefined,
    updatedAt: raw.modified_on ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
