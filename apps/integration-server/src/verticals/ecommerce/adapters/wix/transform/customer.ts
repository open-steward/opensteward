/**
 * Wix Contact → canonical Customer.
 *
 * Wix uses "Contacts" instead of "Customers". The Contact schema has nested
 * `info.name.first`, `info.name.last`, `info.emails[].email`,
 * `info.phones[].phone`, and `info.addresses[]`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawWixAddress {
  streetAddress?: { name?: string; number?: string }
  addressLine?: string
  addressLine2?: string
  city?: string
  subdivision?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export interface RawWixContact {
  id?: string
  info?: {
    name?: {
      first?: string
      last?: string
    }
    emails?: Array<{
      email?: string
      tag?: string
      primary?: boolean
    }>
    phones?: Array<{
      phone?: string
      tag?: string
      primary?: boolean
    }>
    addresses?: Array<{
      address?: RawWixAddress
      tag?: string
    }>
    labelKeys?: string[]
  }
  createdDate?: string
  updatedDate?: string
  [key: string]: unknown
}

function mapAddress(raw: RawWixAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const streetLine = raw.streetAddress
    ? [raw.streetAddress.number, raw.streetAddress.name].filter(Boolean).join(' ')
    : undefined
  const line1 = streetLine || raw.addressLine || undefined
  const line2 = raw.addressLine2 || undefined
  const city = raw.city || undefined
  const region = raw.subdivision || undefined
  const postalCode = raw.postalCode || undefined
  const country = raw.country || undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawWixContact): Customer {
  const info = raw.info
  const primaryEmail = info?.emails?.find((e) => e.primary)?.email ?? info?.emails?.[0]?.email
  const primaryPhone = info?.phones?.find((p) => p.primary)?.phone ?? info?.phones?.[0]?.phone
  const addresses = (info?.addresses ?? [])
    .map((a) => mapAddress(a.address))
    .filter((a): a is Address => !!a)

  return {
    id: raw.id ?? '',
    email: primaryEmail || undefined,
    firstName: info?.name?.first || undefined,
    lastName: info?.name?.last || undefined,
    phone: primaryPhone || undefined,
    tags: info?.labelKeys && info.labelKeys.length > 0 ? info.labelKeys : undefined,
    defaultAddress: addresses[0],
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.createdDate,
    updatedAt: raw.updatedDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Wix contact body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const info: Record<string, unknown> = {}

  if (customer.firstName || customer.lastName) {
    info.name = {
      first: customer.firstName,
      last: customer.lastName,
    }
  }
  if (customer.email) {
    info.emails = [{ email: customer.email, primary: true }]
  }
  if (customer.phone) {
    info.phones = [{ phone: customer.phone, primary: true }]
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    info.addresses = [
      {
        address: {
          addressLine: a.line1,
          addressLine2: a.line2,
          city: a.city,
          subdivision: a.region,
          postalCode: a.postalCode,
          country: a.country,
        },
      },
    ]
  }
  if (customer.tags) {
    info.labelKeys = customer.tags
  }

  return { info }
}
