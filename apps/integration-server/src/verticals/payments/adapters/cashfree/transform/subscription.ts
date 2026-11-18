import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Cashfree Subscription entity (`GET /subscriptions/{subscription_id}`).
 *
 * plan_details carries the recurring amount and interval; the canonical
 * `items` array is built from that single plan.
 */
export interface RawCashfreeSubscription {
  subscription_id?: string
  cf_subscription_id?: string | number
  subscription_status?: string
  subscription_expiry_time?: string
  subscription_first_charge_time?: string
  next_schedule_date?: string | null
  subscription_note?: string | null
  subscription_session_id?: string
  subscription_tags?: Record<string, unknown> | null
  subscription_meta?: { return_url?: string; [k: string]: unknown } | null
  subscription_payment_splits?: Array<Record<string, unknown>> | null
  customer_details?: {
    customer_name?: string
    customer_email?: string
    customer_phone?: string
    customer_bank_account_number?: string
    [k: string]: unknown
  } | null
  plan_details?: {
    plan_id?: string
    plan_name?: string
    plan_type?: string
    plan_recurring_amount?: number | string
    plan_currency?: string
    plan_interval_type?: string
    plan_intervals?: number
    plan_max_cycles?: number
    plan_max_amount?: number | string
    [k: string]: unknown
  } | null
  authorisation_details?: {
    authorization_amount?: number | string
    authorization_status?: string
    authorization_time?: string
    payment_id?: string
    payment_group?: string
    [k: string]: unknown
  } | null
  [k: string]: unknown
}

function mapStatus(raw: string): SubscriptionStatus {
  switch (raw.toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'INITIATED':
    case 'BANK_APPROVAL_PENDING':
      return 'incomplete'
    case 'PAUSED':
      return 'paused'
    case 'CANCELLED':
    case 'TERMINATED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'ON_HOLD':
      return 'past_due'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawCashfreeSubscription): Subscription {
  const id = String(raw.subscription_id ?? raw.cf_subscription_id ?? '')
  const plan = raw.plan_details
  const customerId = String(
    raw.customer_details?.customer_email ??
    raw.customer_details?.customer_phone ??
    '',
  )

  const itemAmount = plan ? toMinorUnits(plan.plan_recurring_amount) : 0
  const currency = plan ? pickCurrency(plan.plan_currency) : 'INR'

  return {
    id,
    externalId: id,
    customerId,
    status: mapStatus(String(raw.subscription_status ?? '')),
    currency,
    items: plan
      ? [
          {
            id: plan.plan_id ?? id,
            priceId: plan.plan_id,
            amount: itemAmount,
            metadata: strMap({ plan_type: plan.plan_type, plan_name: plan.plan_name }),
          },
        ]
      : [],
    currentPeriodStart: toIsoDatetime(raw.subscription_first_charge_time) ?? undefined,
    currentPeriodEnd: toIsoDatetime(raw.subscription_expiry_time) ?? undefined,
    cancelledAt: raw.subscription_status?.toUpperCase() === 'CANCELLED'
      ? toIsoDatetime(raw.subscription_expiry_time) ?? undefined
      : undefined,
    gateway: 'cashfree',
    metadata: strMap({
      cf_subscription_id: raw.cf_subscription_id,
      plan_id: plan?.plan_id,
      plan_interval_type: plan?.plan_interval_type,
      plan_intervals: plan?.plan_intervals,
      plan_max_cycles: plan?.plan_max_cycles,
      next_schedule_date: raw.next_schedule_date,
      subscription_note: raw.subscription_note,
    }),
    createdAt: toIsoDatetime(raw.subscription_first_charge_time) ?? undefined,
    updatedAt: toIsoDatetime(raw.next_schedule_date ?? raw.subscription_expiry_time) ?? undefined,
    raw,
  }
}
