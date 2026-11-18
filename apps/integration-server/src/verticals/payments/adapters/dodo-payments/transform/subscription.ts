/**
 * Dodo Payments `Subscription` → canonical `Subscription`.
 *
 * Status values: pending, active, on_hold, cancelled, failed, expired.
 * `payment_frequency_interval` is one of Day | Week | Month | Year and pairs
 * with `payment_frequency_count`. `recurring_pre_tax_amount` is the unit
 * amount in minor units.
 *
 * Docs: https://docs.dodopayments.com/api-reference/subscriptions/get-subscriptions
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawDodoCustomerLimited } from './charge'
import { strMap } from './shared'

export interface RawDodoSubscription {
  subscription_id?: string
  product_id?: string
  customer?: RawDodoCustomerLimited
  status?: string
  currency?: string
  recurring_pre_tax_amount?: number
  quantity?: number
  payment_frequency_interval?: string
  payment_frequency_count?: number
  subscription_period_interval?: string
  subscription_period_count?: number
  trial_period_days?: number
  tax_inclusive?: boolean
  cancel_at_next_billing_date?: boolean
  created_at?: string
  next_billing_date?: string
  previous_billing_date?: string
  cancelled_at?: string | null
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawDodoSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'on_hold':
      return 'past_due'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
      return 'expired'
    case 'failed':
      return 'incomplete'
    case 'pending':
      return 'incomplete'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawDodoSubscription): Subscription {
  return {
    id: String(raw.subscription_id ?? ''),
    externalId: String(raw.subscription_id ?? ''),
    customerId: String(raw.customer?.customer_id ?? ''),
    status: mapStatus(raw),
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    items: [
      {
        id: String(raw.subscription_id ?? ''),
        productId: raw.product_id ?? undefined,
        quantity: raw.quantity ?? undefined,
        amount: raw.recurring_pre_tax_amount ?? undefined,
      },
    ],
    currentPeriodStart: toIsoDatetime(raw.previous_billing_date),
    currentPeriodEnd: toIsoDatetime(raw.next_billing_date),
    cancelledAt: toIsoDatetime(raw.cancelled_at),
    cancelAtPeriodEnd: raw.cancel_at_next_billing_date ?? undefined,
    collectionMethod: 'charge_automatically',
    gateway: 'dodo-payments',
    metadata: strMap({
      ...raw.metadata,
      payment_frequency_interval: raw.payment_frequency_interval,
      payment_frequency_count: raw.payment_frequency_count,
      trial_period_days: raw.trial_period_days,
      tax_inclusive: raw.tax_inclusive,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.next_billing_date ?? raw.created_at),
    raw,
  }
}
