/**
 * Foxy.io Customer → canonical Customer.
 *
 * Foxy customers are simple objects with email as the primary identifier.
 * Addresses are accessed via the `fx:customer_addresses` embedded resource
 * (zoom=customer_addresses). We surface them when present.
 *
 * Docs: https://api.foxycart.com/rels/customer
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFoxyCustomerAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  is_default_billing?: boolean
  is_default_shipping?: boolean
  [key: string]: unknown
}

export interface RawFoxyCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  /** Foxy does not expose a phone field at the customer level. */
  tax_id?: string | null
  is_anonymous?: boolean
  date_created?: string | null
  date_modified?: string | null
  _embedded?: {
    'fx:customer_addresses'?: RawFoxyCustomerAddress[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawFoxyCustomerAddress): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? undefined
  const postalCode = raw.postal_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.region ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawFoxyCustomer): Customer {
  const rawAddresses: RawFoxyCustomerAddress[] =
    raw._embedded?.['fx:customer_addresses'] ?? []

  const addresses = rawAddresses
    .map((a) => mapAddress(a))
    .filter((a): a is Address => !!a)

  // Foxy marks individual addresses as billing/shipping defaults.
  const defaultAddr =
    rawAddresses.find((a) => a.is_default_billing) ??
    rawAddresses.find((a) => a.is_default_shipping) ??
    rawAddresses[0]

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    // Foxy has no customer-level phone; omit.
    defaultAddress: defaultAddr ? mapAddress(defaultAddr) : undefined,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
  }
}
