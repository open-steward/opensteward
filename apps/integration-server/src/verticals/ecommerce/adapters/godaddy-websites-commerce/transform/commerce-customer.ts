/**
 * GoDaddy Commerce customer → canonical Customer.
 *
 * Shape from the first-party contract
 * https://developer.godaddy.com/openapi/customers.json (`Customer`,
 * `CustomerBase`, `Email`, `Phone`, `Address`) and the guide
 * https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers/customer:
 * "Each customer is identified by `customerId`. Contact details (`emails`,
 * `phones`) are arrays, not scalar fields".
 */

import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawGoDaddyEmail {
  email: string
  label?: string
  /** "Indicates whether the email is the primary email." */
  default?: boolean
}

export interface RawGoDaddyPhone {
  phone: string
  label?: string | null
  /** "Indicates whether the phone is the primary phone." */
  default?: boolean
  blocked?: boolean
}

export interface RawGoDaddyAddress {
  address1?: string
  address2?: string
  city?: string
  /** "State or province or territory" */
  state?: string
  /** "Postal or zip code" */
  postalCode?: string
  /** "Country ISO code" */
  country?: string
  label?: string
}

export interface RawGoDaddyCustomer {
  customerId: string
  firstName: string
  lastName: string
  emails?: RawGoDaddyEmail[]
  phones?: RawGoDaddyPhone[]
  /** "Array of customer addresses. Note that currently only one address is supported" */
  addresses?: RawGoDaddyAddress[]
  /** "Number of orders the customer has made" */
  orderCount?: number
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

/** The entry flagged `default`, or the only entry when there is just one. */
function primary<T extends { default?: boolean }>(entries: T[] | undefined): T | undefined {
  if (!entries || entries.length === 0) return undefined
  return entries.find((e) => e.default === true) ?? (entries.length === 1 ? entries[0] : undefined)
}

function toAddress(raw: RawGoDaddyAddress): Address {
  return {
    ...(raw.address1 ? { line1: raw.address1 } : {}),
    ...(raw.address2 ? { line2: raw.address2 } : {}),
    ...(raw.city ? { city: raw.city } : {}),
    ...(raw.state ? { region: raw.state } : {}),
    ...(raw.postalCode ? { postalCode: raw.postalCode } : {}),
    ...(raw.country && isIso3166Alpha2(raw.country) ? { country: raw.country } : {}),
  }
}

export function transformCommerceCustomer(raw: RawGoDaddyCustomer): Customer {
  const email = primary(raw.emails)?.email
  const phone = primary(raw.phones)?.phone
  const addresses = (raw.addresses ?? []).map(toAddress)
  const createdAt = toIsoDatetime(raw.createdAt)
  const updatedAt = toIsoDatetime(raw.updatedAt)
  return {
    id: raw.customerId,
    ...(email ? { email } : {}),
    ...(raw.firstName ? { firstName: raw.firstName } : {}),
    ...(raw.lastName ? { lastName: raw.lastName } : {}),
    ...(phone ? { phone } : {}),
    ...(typeof raw.orderCount === 'number' ? { ordersCount: raw.orderCount } : {}),
    ...(addresses.length > 0 ? { addresses } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
