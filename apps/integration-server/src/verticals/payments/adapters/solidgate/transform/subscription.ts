import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { sgDatetime } from './shared'

/**
 * One value of the `subscriptions` map in the subscriptions report
 * (POST https://reports.solidgate.com/api/v1/subscriptions). Required there:
 * id, status, started_at, updated_at, customer, product (id, name, amount,
 * currency).
 */
export interface RawSolidgateSubscription {
  id: string
  status: string
  started_at: string
  updated_at: string
  expired_at?: string
  next_charge_at?: string
  cancelled_at?: string
  cancel_code?: string
  cancel_message?: string
  customer: { customer_account_id: string; customer_email?: string }
  product: { id: string; name: string; amount: number; currency: string }
}

/**
 * Subscription statuses: active, cancelled, paused, and redemption, which
 * https://docs.solidgate.com/billing/subscriptions/subscriptions-1.0/subscription-overview/
 * describes as "if a recurring payment is declined due to a certain error
 * code, the subscription enters a redemption period. If all retries fail, the
 * subscription is cancelled".
 */
const STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  cancelled: 'cancelled',
  paused: 'paused',
  redemption: 'past_due',
}

export function transformSubscription(raw: RawSolidgateSubscription): Subscription {
  const currency = raw.product.currency.toUpperCase()
  const metadata: Record<string, string> = {}
  if (raw.cancel_code) metadata.cancel_code = raw.cancel_code
  if (raw.cancel_message) metadata.cancel_message = raw.cancel_message
  return {
    id: raw.id,
    externalId: raw.id,
    customerId: raw.customer.customer_account_id,
    status: STATUS[raw.status] ?? 'unknown',
    currency,
    items: [
      {
        id: `${raw.id}:${raw.product.id}`,
        productId: raw.product.id,
        amount: raw.product.amount,
      },
    ],
    cancelledAt: sgDatetime(raw.cancelled_at),
    gateway: 'solidgate',
    metadata,
    createdAt: sgDatetime(raw.started_at),
    updatedAt: sgDatetime(raw.updated_at),
    raw,
  }
}
