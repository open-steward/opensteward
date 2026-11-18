/**
 * Salesforce Commerce Cloud (SCAPI) Customer → canonical Customer.
 *
 * SCAPI's Shopper Customers API returns camelCase JSON.  The customer profile
 * shape (`CustomerProfile`) uses `firstName`, `lastName`, `email`, etc.
 * Addresses are stored in a nested `addresses` array.
 *
 * Reference:
 *   GET  /customer/shopper-customers/v1/organizations/{orgId}/customers/{customerId}
 *   POST /customer/shopper-customers/v1/organizations/{orgId}/customers
 *   PATCH /customer/shopper-customers/v1/organizations/{orgId}/customers/{customerId}
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiAddress {
  addressId?: string
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  stateCode?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  preferred?: boolean
  [key: string]: unknown
}

export interface RawScapiCustomer {
  customerId: string
  customerNo?: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  login?: string | null
  enabled?: boolean
  addressBook?: {
    addresses?: RawScapiAddress[]
    preferredAddress?: RawScapiAddress | null
  } | null
  ordersCount?: number
  createdAt?: string
  lastModified?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawScapiAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.stateCode ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawScapiCustomer): Customer {
  const addresses = raw.addressBook?.addresses ?? []
  const preferred = raw.addressBook?.preferredAddress ?? addresses[0] ?? null
  const canonical: Customer = {
    id: raw.customerId,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    ordersCount: raw.ordersCount,
    defaultAddress: mapAddress(preferred),
    addresses: addresses
      .map(mapAddress)
      .filter((a): a is Address => a !== undefined),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.lastModified),
    metadata: raw as unknown as Record<string, unknown>,
  }
  return canonical
}

/** Canonical Customer → SCAPI customer profile body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.addressBook = {
      addresses: [
        {
          addressId: 'primary',
          address1: a.line1,
          address2: a.line2,
          city: a.city,
          stateCode: a.region,
          postalCode: a.postalCode,
          countryCode: a.country,
          preferred: true,
        },
      ],
    }
  }
  return body
}
