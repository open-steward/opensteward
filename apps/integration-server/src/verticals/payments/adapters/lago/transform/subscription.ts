/**
 * Lago Subscription ↔ canonical Subscription.
 *
 * A Lago subscription binds a customer (`external_customer_id`) to a plan
 * (`plan_code`). Its `status` is one of pending / active / terminated /
 * canceled. Lago does not return per-item pricing on the subscription object —
 * charges live on the plan — so `items` carries a single entry referencing the
 * plan as the `priceId`. Period bounds come from
 * `current_billing_period_started_at` / `current_billing_period_ending_at`.
 *
 * Docs: https://getlago.com/docs/api-reference/subscriptions/subscription-object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { strMap } from './shared'

export interface RawLagoSubscription {
  lago_id?: string
  external_id?: string
  lago_customer_id?: string
  external_customer_id?: string
  plan_code?: string
  status?: string | null
  name?: string | null
  billing_time?: string | null
  created_at?: string
  canceled_at?: string | null
  started_at?: string | null
  ending_at?: string | null
  subscription_at?: string | null
  terminated_at?: string | null
  trial_ended_at?: string | null
  current_billing_period_started_at?: string | null
  current_billing_period_ending_at?: string | null
  previous_plan_code?: string | null
  next_plan_code?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawLagoSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'pending':
      return 'incomplete'
    case 'canceled':
    case 'cancelled':
    case 'terminated':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawLagoSubscription): Subscription {
  const id = String(raw.external_id ?? raw.lago_id ?? '')
  return {
    id,
    externalId: id,
    customerId: String(raw.external_customer_id ?? raw.lago_customer_id ?? ''),
    status: mapStatus(raw),
    items: raw.plan_code
      ? [{ id: raw.plan_code, priceId: raw.plan_code, productId: raw.plan_code }]
      : [],
    currentPeriodStart: toIsoDatetime(raw.current_billing_period_started_at),
    currentPeriodEnd: toIsoDatetime(raw.current_billing_period_ending_at),
    trialEnd: toIsoDatetime(raw.trial_ended_at),
    cancelledAt: toIsoDatetime(raw.canceled_at ?? raw.terminated_at),
    gateway: 'lago',
    metadata: strMap({
      plan_code: raw.plan_code,
      billing_time: raw.billing_time,
      name: raw.name,
    }),
    createdAt: toIsoDatetime(raw.created_at ?? raw.subscription_at),
    raw,
  }
}
