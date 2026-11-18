import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A HitPay Recurring Billing record — a subscription instance attached to a
 * plan via `POST /v1/recurring-billing`.
 * Listed via `GET /v1/recurring-billing`, deleted via `DELETE /v1/recurring-billing/{id}`.
 *
 * Docs: https://docs.hitpayapp.com/apis/recurring-billing/get-all-billing
 */
export interface RawHitpayRecurringBilling {
  id?: string
  business_recurring_plans_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  name?: string | null
  description?: string | null
  reference?: string | null
  cycle?: string | null
  cycle_repeat?: number | null
  cycle_frequency?: string | null
  currency?: string | null
  amount?: string | number | null
  times_to_be_charged?: number | null
  times_charged?: number | null
  status?: string | null
  send_email?: boolean | null
  save_card?: number | boolean | null
  redirect_url?: string | null
  payment_methods?: string[] | null
  webhook?: string | null
  created_at?: string
  updated_at?: string
  expires_at?: string | null
  url?: string | null
  [k: string]: unknown
}

/**
 * Map HitPay recurring billing status → canonical SubscriptionStatus.
 * HitPay statuses: active | scheduled | retrying | inactive | canceled
 */
function mapStatus(raw: RawHitpayRecurringBilling): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'scheduled':
    case 'retrying':
      return 'incomplete'
    case 'inactive':
      return 'expired'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawHitpayRecurringBilling): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_email ?? '',
    status: mapStatus(raw),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: raw.amount != null
      ? [
          {
            id: String(raw.id ?? ''),
            priceId: raw.business_recurring_plans_id ?? undefined,
            productId: undefined,
            quantity: 1,
            amount: toMinorUnits(raw.amount),
          },
        ]
      : [],
    currentPeriodStart: undefined,
    currentPeriodEnd: toIsoDatetime(raw.expires_at ?? undefined),
    billingAnchor: toIsoDatetime(raw.created_at),
    trialStart: undefined,
    trialEnd: undefined,
    cancelAt: undefined,
    cancelledAt: undefined,
    cancelAtPeriodEnd: false,
    collectionMethod: 'charge_automatically',
    dunningState: raw.status === 'retrying' ? 'retrying' : undefined,
    defaultPaymentMethodId: undefined,
    latestInvoiceId: undefined,
    gateway: 'hitpay',
    metadata: strMap({
      customer_name: raw.customer_name,
      customer_email: raw.customer_email,
      reference: raw.reference,
      cycle: raw.cycle,
      times_to_be_charged: raw.times_to_be_charged,
      times_charged: raw.times_charged,
      url: raw.url,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
