import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, strToMinor } from './shared'

export interface RawPaddleSubscription {
  id?: string
  status?: string
  customer_id?: string
  currency_code?: string
  items?: Array<{
    price?: { id?: string; unit_price?: { amount?: string } }
    quantity?: number
  }>
  current_billing_period?: { starts_at?: string; ends_at?: string }
  next_billed_at?: string
  scheduled_change?: { action?: string; effective_at?: string }
  canceled_at?: string
  started_at?: string
  first_billed_at?: string
  created_at?: string
  updated_at?: string
  custom_data?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawPaddleSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawPaddleSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer_id ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency_code),
    items:
      raw.items?.map((it, idx) => ({
        id: `${raw.id ?? 'item'}-${idx}`,
        priceId: it.price?.id,
        quantity: it.quantity,
        amount: strToMinor(it.price?.unit_price?.amount),
      })) ?? [],
    currentPeriodStart: raw.current_billing_period?.starts_at,
    currentPeriodEnd: raw.current_billing_period?.ends_at,
    cancelledAt: raw.canceled_at,
    cancelAt: raw.scheduled_change?.action === 'cancel' ? raw.scheduled_change.effective_at : undefined,
    cancelAtPeriodEnd:
      raw.scheduled_change?.action === 'cancel' &&
      raw.scheduled_change.effective_at === raw.current_billing_period?.ends_at,
    gateway: 'paddle',
    metadata: strMap({ ...raw.custom_data }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
