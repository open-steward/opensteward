/**
 * Clover Customer → canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawCloverAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface RawCloverCustomer {
  id: string
  emailAddresses?: { elements?: Array<{ emailAddress?: string }> }
  phoneNumbers?: { elements?: Array<{ phoneNumber?: string }> }
  firstName?: string
  lastName?: string
  marketingAllowed?: boolean
  addresses?: { elements?: RawCloverAddress[] }
  orders?: { elements?: Array<{ id?: string }> }
  createdTime?: number
  modifiedTime?: number
  [key: string]: unknown
}

function mapAddress(raw: RawCloverAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawCloverCustomer): Customer {
  const email = raw.emailAddresses?.elements?.[0]?.emailAddress ?? undefined
  const phone = raw.phoneNumbers?.elements?.[0]?.phoneNumber ?? undefined
  const defaultAddress = mapAddress(raw.addresses?.elements?.[0])
  const ordersCount = raw.orders?.elements?.length

  return {
    id: raw.id,
    email,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone,
    acceptsMarketing: raw.marketingAllowed ?? undefined,
    ordersCount,
    defaultAddress,
    createdAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    updatedAt: raw.modifiedTime ? new Date(raw.modifiedTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Clover customer body for create/update. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    marketingAllowed: customer.acceptsMarketing,
  }
  if (customer.email) {
    body['emailAddresses'] = {
      elements: [{ emailAddress: customer.email }],
    }
  }
  if (customer.phone) {
    body['phoneNumbers'] = {
      elements: [{ phoneNumber: customer.phone }],
    }
  }
  return body
}
