/**
 * Spryker customers → canonical Customer.
 *
 * Spryker Glue REST API: GET /customers/{customerReference}
 *   Response: JSON:API resource with type "customers".
 *
 * Key attribute fields: salutation, firstName, lastName, email, phone,
 *   gender, dateOfBirth, createdAt, updatedAt.
 *
 * Customer references use a "DE--{id}" pattern (store-specific prefix).
 * The `id` on the JSON:API resource object IS the customer reference.
 *
 * Addresses are a separate resource: GET /customers/{id}/addresses
 * and are not automatically included in the customer response.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import type { JsonApiResource } from '../client'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerCustomerAttributes {
  salutation?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface RawSprykerAddressAttributes {
  salutation?: string | null
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  address3?: string | null
  city?: string | null
  zipCode?: string | null
  country?: { iso2Code?: string; name?: string } | null
  iso2Code?: string | null
  phone?: string | null
  company?: string | null
  isDefaultShipping?: boolean
  isDefaultBilling?: boolean
  [key: string]: unknown
}

export type RawSprykerCustomer = JsonApiResource<RawSprykerCustomerAttributes>
export type RawSprykerAddress = JsonApiResource<RawSprykerAddressAttributes>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawSprykerAddressAttributes): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = [raw.address2, raw.address3].filter(Boolean).join(', ') || undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const country = raw.country?.iso2Code ?? raw.iso2Code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, postalCode, country }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(
  raw: RawSprykerCustomer,
  addresses: RawSprykerAddress[] = [],
): Customer {
  const attrs = raw.attributes
  const mappedAddresses = addresses
    .map((a) => mapAddress(a.attributes))
    .filter((a): a is Address => !!a)

  const defaultBillingIdx = addresses.findIndex((a) => a.attributes.isDefaultBilling)
  const defaultShippingIdx = addresses.findIndex((a) => a.attributes.isDefaultShipping)
  const defaultAddress =
    defaultShippingIdx >= 0
      ? mappedAddresses[defaultShippingIdx]
      : defaultBillingIdx >= 0
        ? mappedAddresses[defaultBillingIdx]
        : mappedAddresses[0]

  return {
    id: raw.id,
    email: attrs.email ?? undefined,
    firstName: attrs.firstName ?? undefined,
    lastName: attrs.lastName ?? undefined,
    phone: attrs.phone ?? undefined,
    defaultAddress,
    addresses: mappedAddresses.length > 0 ? mappedAddresses : undefined,
    createdAt: toIsoDatetime(attrs.createdAt),
    updatedAt: toIsoDatetime(attrs.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Spryker customers create/update body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    data: {
      type: 'customers',
      attributes: {
        salutation: 'Mr',
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        acceptedTerms: true,
      },
    },
  }
}
