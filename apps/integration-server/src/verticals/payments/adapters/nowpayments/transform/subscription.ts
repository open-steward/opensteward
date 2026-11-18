/**
 * NOWPayments recurring payment → canonical Subscription.
 *
 * "Get many recurring payments" (GET /v1/subscriptions) returns rows shaped
 * {"id","subscription_plan_id","is_active","status","expire_date",
 *  "subscriber":{"sub_partner_id":"111394288"} | {"email":"test@example.com"},
 *  "created_at","updated_at"};
 * https://documenter.getpostman.com/view/7907941/2s93JusNJt.
 *
 * The subscriber is either a customer (sub-partner) or an e-mail address, the
 * two shapes the example shows. customerId is the sub-partner id when there is
 * one, which is the id listCustomers returns, and the e-mail otherwise. The plan
 * id stays in metadata: the row carries no subscription item of its own, and
 * the amount lives on the plan.
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { requireId, strMap } from './shared'

export interface RawNowpaymentsSubscription {
  id?: number | string | null
  subscription_plan_id?: number | string | null
  is_active?: boolean | null
  status?: string | null
  expire_date?: string | null
  subscriber?: { sub_partner_id?: string | number | null; email?: string | null } | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * The documented statuses: "WAITING_PAY" ("waiting for user's deposit"),
 * "PAID", "PARTIALLY_PAID" ("the final amount is less than required"),
 * "EXPIRED".
 */
function mapStatus(s: string | null | undefined): SubscriptionStatus {
  switch (s) {
    case 'PAID':
      return 'active'
    case 'WAITING_PAY':
    case 'PARTIALLY_PAID':
      return 'incomplete'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'unknown'
  }
}

function subscriberId(raw: RawNowpaymentsSubscription, id: string): string {
  const s = raw.subscriber
  if (s?.sub_partner_id != null && s.sub_partner_id !== '') return String(s.sub_partner_id)
  if (s?.email) return s.email
  throw new Error(`NOWPayments subscription ${id}: subscriber has neither sub_partner_id nor email`)
}

export function transformSubscription(raw: RawNowpaymentsSubscription): Subscription {
  const id = requireId(raw.id, 'subscription')
  return {
    id,
    externalId: id,
    customerId: subscriberId(raw, id),
    status: mapStatus(raw.status),
    items: [],
    gateway: 'nowpayments',
    metadata: strMap({
      subscription_plan_id: raw.subscription_plan_id,
      is_active: raw.is_active,
      status: raw.status,
      expire_date: raw.expire_date,
      subscriber_email: raw.subscriber?.email,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
