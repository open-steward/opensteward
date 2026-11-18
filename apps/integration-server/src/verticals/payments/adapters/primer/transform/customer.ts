/**
 * Primer Customer → canonical Customer.
 *
 * Primer does not expose a standalone customer CRUD surface — the customer is
 * embedded in a Payment as a `customer` object (email + name + address) with
 * the merchant-supplied identifier carried separately as the payment's
 * top-level `customerId`. We therefore transform the embedded summary, taking
 * the id from the (optional) enclosing payment context.
 *
 * Ref: https://primer.io/docs/payments/payments-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPrimerBillingAddress {
  firstName?: string
  lastName?: string
  emailAddress?: string
  [k: string]: unknown
}

export interface RawPrimerCustomer {
  customerId?: string
  emailAddress?: string
  firstName?: string
  lastName?: string
  mobileNumber?: string
  billingAddress?: RawPrimerBillingAddress
  nationalDocumentId?: string
  dateCreated?: string
  dateUpdated?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * @param raw   the embedded Primer `customer` object
 * @param id    the enclosing payment's `customerId` (merchant reference), used
 *              as the canonical id when the embedded object omits its own
 */
export function transformCustomer(raw: RawPrimerCustomer, id?: string): Customer {
  const first = raw.firstName ?? raw.billingAddress?.firstName
  const last = raw.lastName ?? raw.billingAddress?.lastName
  const name = [first, last].filter(Boolean).join(' ').trim()
  const customerId = String(raw.customerId ?? id ?? '')
  return {
    id: customerId,
    externalId: customerId,
    email: raw.emailAddress ?? raw.billingAddress?.emailAddress ?? undefined,
    name: name || undefined,
    phone: raw.mobileNumber ?? undefined,
    gateway: 'primer',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.dateCreated),
    updatedAt: toIsoDatetime(raw.dateUpdated),
    raw,
  }
}
