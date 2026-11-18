/**
 * Centra Order API Customer → canonical Customer.
 *
 * Centra customer fields from GET /customers:
 *  - `customerId`, `email`, `firstName`, `lastName`
 *  - `address1`, `address2`, `zipCode`, `city`, `state`, `country`
 *  - `phoneNumber`
 *  - `newsletter`    — boolean opt-in flag (maps to `acceptsMarketing`)
 *  - `registered`    — ISO-8601 date string
 *  - `created`       — ISO-8601 date string
 *  - `modified`      — ISO-8601 date string
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCentraCustomer {
  customerId: number | string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  zipCode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  phoneNumber?: string | null
  newsletter?: boolean
  registered?: string | null
  created?: string
  modified?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCentraCustomer): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawCentraCustomer): Customer {
  return {
    id: String(raw.customerId),
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    acceptsMarketing: raw.newsletter,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    defaultAddress: mapAddress(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phoneNumber: customer.phone,
    newsletter: customer.acceptsMarketing,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.address1 = a.line1
    body.address2 = a.line2
    body.city = a.city
    body.state = a.region
    body.zipCode = a.postalCode
    body.country = a.country
  }
  return body
}
