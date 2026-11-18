/**
 * Crystallize Customer -> canonical Customer.
 *
 * Crystallize customers are stored via the Order API and have basic
 * contact information with addresses.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawCrystallizeAddress {
  type?: string
  streetNumber?: string | null
  street?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface RawCrystallizeCustomer {
  identifier: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  companyName?: string | null
  addresses?: RawCrystallizeAddress[]
  meta?: Array<{ key: string; value: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCrystallizeAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1Parts = [raw.streetNumber, raw.street].filter(Boolean)
  const line1 = line1Parts.length > 0 ? line1Parts.join(' ') : undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawCrystallizeCustomer): Customer {
  const addresses = raw.addresses
    ?.map((a) => mapAddress(a))
    .filter((a): a is Address => !!a)

  const defaultAddr = raw.addresses && raw.addresses.length > 0
    ? mapAddress(raw.addresses[0])
    : undefined

  return {
    id: raw.identifier,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    defaultAddress: defaultAddr,
    addresses: addresses && addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
  }
}
