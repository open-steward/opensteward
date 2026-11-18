import type { Subscription, SubscriptionStatus, SubscriptionItem } from '../../../schema/subscription'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawFlutterwaveSubscription {
  id?: number
  status?: string
  amount?: number
  customer?: {
    id?: number
    email?: string
    name?: string
  } | null
  plan?: {
    id?: number
    name?: string
    currency?: string
    interval?: string
    amount?: number
  } | null
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFlutterwaveSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'cancelled':
    case 'canceled':
    case 'non-renewing':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawFlutterwaveSubscription): Subscription {
  const plan = raw.plan
  const currency = pickCurrency(plan?.currency)

  const item: SubscriptionItem | undefined = plan
    ? {
        id: String(plan.id ?? ''),
        priceId: String(plan.id ?? ''),
        quantity: 1,
        amount: decimalToMinor(raw.amount ?? plan.amount),
      }
    : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer?.id ?? ''),
    status: mapStatus(raw),
    currency,
    items: item ? [item] : [],
    gateway: 'flutterwave',
    metadata: strMap({
      plan_name: plan?.name,
      customer_email: raw.customer?.email,
    }),
    createdAt: raw.created_at,
    raw,
  }
}
