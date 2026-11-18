import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawChargebeeSubscription {
  id?: string
  customer_id?: string
  status?: string
  currency_code?: string
  subscription_items?: Array<{
    item_price_id?: string
    quantity?: number
    unit_price?: number
  }>
  current_term_start?: number
  current_term_end?: number
  trial_start?: number
  trial_end?: number
  cancelled_at?: number
  cancel_at_term_end?: boolean
  payment_source_id?: string
  created_at?: number
  updated_at?: number
  meta_data?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawChargebeeSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'in_trial':
      return 'trialing'
    case 'active':
      return 'active'
    case 'non_renewing':
      return 'active'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'cancelled'
    case 'transferred':
    case 'expired':
      return 'expired'
    case 'future':
      return 'incomplete'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawChargebeeSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer_id ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency_code),
    items:
      raw.subscription_items?.map((it, idx) => ({
        id: `${raw.id ?? 'item'}-${idx}`,
        priceId: it.item_price_id,
        quantity: it.quantity,
        amount: it.unit_price,
      })) ?? [],
    currentPeriodStart: toIso(raw.current_term_start),
    currentPeriodEnd: toIso(raw.current_term_end),
    trialStart: toIso(raw.trial_start),
    trialEnd: toIso(raw.trial_end),
    cancelledAt: toIso(raw.cancelled_at),
    cancelAtPeriodEnd: raw.cancel_at_term_end,
    defaultPaymentMethodId: raw.payment_source_id,
    gateway: 'chargebee',
    metadata: strMap(raw.meta_data),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
