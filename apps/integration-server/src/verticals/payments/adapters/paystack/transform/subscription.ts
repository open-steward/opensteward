import type { Subscription, SubscriptionStatus, SubscriptionItem } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawPaystackSubscription {
  id?: number
  subscription_code?: string
  status?: string
  quantity?: number
  amount?: number
  currency?: string
  plan?: {
    id?: number
    plan_code?: string
    currency?: string
    interval?: string
  } | null
  customer?: {
    id?: number
    customer_code?: string
    email?: string
  } | null
  next_payment_date?: string | null
  start?: string | null
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaystackSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'non-renewing':
    case 'completed':
      return 'cancelled'
    case 'attention':
    case 'past_due':
      return 'past_due'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawPaystackSubscription): Subscription {
  const plan = raw.plan
  const customer = raw.customer

  const item: SubscriptionItem | undefined =
    plan
      ? {
          id: String(plan.id ?? plan.plan_code ?? ''),
          priceId: String(plan.plan_code ?? plan.id ?? ''),
          quantity: raw.quantity ?? 1,
          amount: raw.amount,
        }
      : undefined

  return {
    id: String(raw.id ?? raw.subscription_code ?? ''),
    externalId: String(raw.subscription_code ?? raw.id ?? ''),
    customerId: String(customer?.customer_code ?? customer?.id ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(plan?.currency ?? raw.currency),
    items: item ? [item] : [],
    currentPeriodStart: raw.start ?? undefined,
    currentPeriodEnd: raw.next_payment_date ?? undefined,
    gateway: 'paystack',
    metadata: strMap({ plan_code: plan?.plan_code, interval: plan?.interval }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
