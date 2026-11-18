import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawGCSubscription {
  id?: string
  status?: string
  amount?: number
  currency?: string
  name?: string
  interval?: number
  interval_unit?: string
  start_date?: string
  end_date?: string
  upcoming_payments?: Array<{ charge_date?: string; amount?: number }>
  links?: { mandate?: string; customer?: string }
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawGCSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'cancelled'
    case 'finished':
      return 'expired'
    case 'pending_customer_approval':
      return 'incomplete'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawGCSubscription): Subscription {
  const next = raw.upcoming_payments?.[0]
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.links?.customer ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    items: [{ id: String(raw.id ?? ''), amount: raw.amount }],
    billingAnchor: raw.start_date,
    currentPeriodEnd: next?.charge_date ?? raw.end_date,
    defaultPaymentMethodId: raw.links?.mandate,
    gateway: 'gocardless',
    metadata: strMap({ name: raw.name, interval: raw.interval, interval_unit: raw.interval_unit }),
    createdAt: raw.created_at,
    raw,
  }
}
