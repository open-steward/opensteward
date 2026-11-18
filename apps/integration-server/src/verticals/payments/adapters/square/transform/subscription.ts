import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawSquareSubscription {
  id?: string
  customer_id?: string
  plan_variation_id?: string
  status?: string
  start_date?: string
  canceled_date?: string
  charged_through_date?: string
  card_id?: string
  card_id_to_be_charged?: string
  invoice_ids?: string[]
  price_override_money?: { amount?: number; currency?: string }
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquareSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELED':
      return 'cancelled'
    case 'DEACTIVATED':
      return 'expired'
    case 'PAUSED':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawSquareSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id ?? '',
    status: mapStatus(raw),
    currency: pickCurrency(raw.price_override_money?.currency),
    items: raw.plan_variation_id
      ? [{ id: raw.plan_variation_id, priceId: raw.plan_variation_id }]
      : [],
    billingAnchor: raw.start_date,
    currentPeriodEnd: raw.charged_through_date,
    cancelAt: raw.canceled_date,
    defaultPaymentMethodId: raw.card_id ?? raw.card_id_to_be_charged,
    latestInvoiceId: raw.invoice_ids?.[raw.invoice_ids.length - 1],
    gateway: 'square',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
