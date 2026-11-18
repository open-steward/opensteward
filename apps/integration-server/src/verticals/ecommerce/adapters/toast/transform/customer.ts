/**
 * Toast Customer → canonical Customer.
 *
 * Toast exposes customer data through the Loyalty and CRM APIs.
 * Customers have basic contact information and order history.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawToastCustomer {
  guid: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  marketingOptIn?: boolean
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformCustomer(raw: RawToastCustomer): Customer {
  return {
    id: raw.guid,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.marketingOptIn ?? undefined,
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.modifiedDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Toast customer body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    marketingOptIn: customer.acceptsMarketing,
  }
}
