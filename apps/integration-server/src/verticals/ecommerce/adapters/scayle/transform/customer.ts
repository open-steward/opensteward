/**
 * SCAYLE Customer → canonical Customer.
 *
 * SCAYLE customer fields:
 *  - id (int), referenceKey, firstName, lastName, email, phone, gender,
 *    birthDate, status: { isActive, isGuestCustomer },
 *    addresses[] (CustomerAddress), createdAt, updatedAt
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleCustomerAddressRecipient {
  firstName?: string | null
  lastName?: string | null
}

export interface RawScayleCustomerAddressDefault {
  billing?: boolean
  shipping?: boolean
}

export interface RawScayleCustomerAddress {
  id?: number | string
  street?: string | null
  houseNumber?: string | null
  additional?: string | null
  zipCode?: string | null
  city?: string | null
  countryCode?: string | null
  state?: string | null
  phone?: string | null
  recipient?: RawScayleCustomerAddressRecipient
  isDefault?: RawScayleCustomerAddressDefault
  [key: string]: unknown
}

export interface RawScayleCustomerStatus {
  isActive?: boolean
  isGuestCustomer?: boolean
}

export interface RawScayleCustomer {
  id: number | string
  referenceKey?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  status?: RawScayleCustomerStatus
  addresses?: RawScayleCustomerAddress[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawScayleCustomerAddress): Address | undefined {
  const line1 = raw.street
    ? `${raw.street}${raw.houseNumber ? ' ' + raw.houseNumber : ''}`
    : undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.additional ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawScayleCustomer): Customer {
  const addresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => !!a)

  // Pick the billing default address, falling back to first address.
  const defaultAddr =
    raw.addresses?.find((a) => a.isDefault?.billing) ??
    raw.addresses?.[0]
  const defaultAddress = defaultAddr ? mapAddress(defaultAddr) : undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → SCAYLE customer body (for create). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    const parts = (a.line1 ?? '').trim().split(/\s+/)
    const houseNumber = parts.length > 1 ? parts.pop() : undefined
    const street = parts.join(' ') || a.line1
    body.addresses = [
      {
        street,
        houseNumber,
        city: a.city,
        zipCode: a.postalCode,
        countryCode: a.country,
        state: a.region,
        isDefault: { billing: true, shipping: true },
        recipient: {
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
      },
    ]
  }
  return body
}
