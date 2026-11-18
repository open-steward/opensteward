/**
 * Paydock subscription → canonical Subscription.
 *
 * Fields from the "Subscription resource" table of Paydock's API reference
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q, folder
 * "subscriptions"): `_id`, `status` ("An actual subscription status. See the
 * status table"), `currency`, `customer.customer_id` ("+3 string (24 hex
 * characters) A customer ID"), `created_at`, `updated_at`. The customer id is
 * nested under `customer`; there is no top-level `customer_id`.
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { optStr, requireId } from './shared'

export interface RawPaydockSubscription {
  [k: string]: unknown
}

/**
 * The subscription "Status" table: active, complete ("all payments have been
 * collected"), deleted, failed ("the number of failed payments has been
 * exceeded"), expired, held ("manually put on hold").
 */
const STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  complete: 'expired',
  expired: 'expired',
  deleted: 'cancelled',
  held: 'paused',
}

export function mapSubscriptionStatus(s: unknown): SubscriptionStatus {
  return (typeof s === 'string' && STATUS[s]) || 'unknown'
}

export function transformSubscription(raw: RawPaydockSubscription): Subscription {
  const id = requireId(raw['_id'], 'subscription')
  const customer = raw['customer'] as Record<string, unknown> | undefined
  const customerId = optStr(customer?.['customer_id'])
  if (customerId === undefined)
    throw new Error(`Paydock subscription ${id} has no customer.customer_id`)
  const currency = optStr(raw['currency'])
  return {
    id,
    externalId: id,
    customerId,
    status: mapSubscriptionStatus(raw['status']),
    currency: currency?.toUpperCase(),
    items: [],
    gateway: 'paydock',
    metadata: {},
    createdAt: optStr(raw['created_at']),
    updatedAt: optStr(raw['updated_at']),
    raw,
  }
}
