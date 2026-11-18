import type {
  Subscription,
  SubscriptionItem,
  SubscriptionStatus,
} from '../../../schema/subscription'
import { toIso, strMap } from './shared'

export interface RawStripeSubscriptionItem {
  id: string
  price?: { id?: string; product?: string; unit_amount?: number; currency?: string } | null
  quantity?: number
  metadata?: Record<string, string> | null
}

export interface RawStripeSubscription {
  id: string
  object: 'subscription'
  customer: string
  status: string
  currency: string
  collection_method?: 'charge_automatically' | 'send_invoice'
  default_payment_method?: string | null
  latest_invoice?: string | null
  items?: { data?: RawStripeSubscriptionItem[] } | null
  current_period_start?: number
  current_period_end?: number
  billing_cycle_anchor?: number
  trial_start?: number | null
  trial_end?: number | null
  cancel_at?: number | null
  canceled_at?: number | null
  cancel_at_period_end?: boolean
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripeSubscription): SubscriptionStatus {
  switch (raw.status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'cancelled'
    case 'unpaid':
    case 'incomplete_expired':
      return 'expired'
    case 'paused':
      return 'paused'
    case 'incomplete':
      return 'incomplete'
    default:
      return 'active'
  }
}

function mapItem(raw: RawStripeSubscriptionItem): SubscriptionItem {
  return {
    id: raw.id,
    priceId: raw.price?.id,
    productId: raw.price?.product,
    quantity: raw.quantity,
    amount: raw.price?.unit_amount,
    metadata: raw.metadata ?? undefined,
  }
}

export function transformSubscription(raw: RawStripeSubscription): Subscription {
  return {
    id: raw.id,
    externalId: raw.id,
    customerId: raw.customer,
    status: mapStatus(raw),
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    items: (raw.items?.data ?? []).map(mapItem),
    currentPeriodStart: toIso(raw.current_period_start),
    currentPeriodEnd: toIso(raw.current_period_end),
    billingAnchor: toIso(raw.billing_cycle_anchor),
    trialStart: toIso(raw.trial_start),
    trialEnd: toIso(raw.trial_end),
    cancelAt: toIso(raw.cancel_at),
    cancelledAt: toIso(raw.canceled_at),
    cancelAtPeriodEnd: raw.cancel_at_period_end,
    collectionMethod: raw.collection_method,
    defaultPaymentMethodId: raw.default_payment_method ?? undefined,
    latestInvoiceId: raw.latest_invoice ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}

export function untransformSubscription(s: Partial<Subscription>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (s.customerId !== undefined) out.customer = s.customerId
  if (s.items) {
    out.items = s.items.map((it) => ({ price: it.priceId, quantity: it.quantity }))
  }
  if (s.defaultPaymentMethodId !== undefined) out.default_payment_method = s.defaultPaymentMethodId
  if (s.collectionMethod !== undefined) out.collection_method = s.collectionMethod
  if (s.cancelAtPeriodEnd !== undefined) out.cancel_at_period_end = s.cancelAtPeriodEnd
  if (s.metadata) out.metadata = s.metadata
  return out
}
