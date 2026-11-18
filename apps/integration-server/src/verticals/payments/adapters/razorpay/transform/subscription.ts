import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpaySubscription {
  id?: string
  customer_id?: string
  plan_id?: string
  status?: string
  current_start?: number
  current_end?: number
  start_at?: number
  end_at?: number
  charge_at?: number
  paid_count?: number
  total_count?: number
  short_url?: string
  notes?: Record<string, unknown>
  created_at?: number
  [k: string]: unknown
}

function mapStatus(raw: RawRazorpaySubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
    case 'authenticated':
      return 'active'
    case 'pending':
      return 'incomplete'
    case 'created':
      return 'incomplete'
    case 'halted':
      return 'past_due'
    case 'cancelled':
      return 'cancelled'
    case 'completed':
    case 'expired':
      return 'expired'
    case 'paused':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawRazorpaySubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer_id ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency('INR'),
    items: raw.plan_id ? [{ id: raw.plan_id, priceId: raw.plan_id }] : [],
    currentPeriodStart: toIso(raw.current_start),
    currentPeriodEnd: toIso(raw.current_end),
    billingAnchor: toIso(raw.start_at),
    cancelAt: toIso(raw.end_at),
    gateway: 'razorpay',
    metadata: strMap({ ...raw.notes, paid_count: raw.paid_count, total_count: raw.total_count }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
