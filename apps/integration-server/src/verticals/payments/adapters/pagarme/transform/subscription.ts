/**
 * Pagar.me v5 subscription transform.
 *
 * Endpoint: GET /subscriptions, GET /subscriptions/{id}
 * The subscription object is a first-class resource in Pagar.me v5.
 *
 * Money (item amounts) is in centavos (minor units). Timestamps are
 * ISO-8601 strings normalised with `toIsoDatetime`.
 *
 * Refs:
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-subscription-response.md
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-subscription-item-response.md
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-pricing-scheme-response.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionItem, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawPagarmeSubscriptionItem {
  id?: string
  name?: string
  description?: string
  status?: string
  quantity?: number
  pricing_scheme?: {
    price?: number
    scheme_type?: string
    [k: string]: unknown
  }
  created_at?: string
  updated_at?: string
  deleted_at?: string
  [k: string]: unknown
}

export interface RawPagarmeSubscriptionCurrentCycle {
  id?: string
  start_at?: string
  end_at?: string
  billing_at?: string
  status?: string
  [k: string]: unknown
}

export interface RawPagarmeSubscription {
  id?: string
  code?: string
  status?: string
  interval?: string
  interval_count?: number
  billing_type?: string
  current_cycle?: RawPagarmeSubscriptionCurrentCycle
  payment_method?: string
  currency?: string
  installments?: number
  start_at?: string
  next_billing_at?: string
  canceled_at?: string
  created_at?: string
  updated_at?: string
  customer?: { id?: string; [k: string]: unknown }
  card?: { id?: string; [k: string]: unknown }
  items?: RawPagarmeSubscriptionItem[]
  statement_descriptor?: string
  metadata?: Record<string, string>
  [k: string]: unknown
}

/**
 * Map Pagar.me subscription status values to canonical SubscriptionStatus.
 * Pagar.me status values: active, canceled, future, inactive
 */
function mapStatus(raw: string | undefined): SubscriptionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'canceled':
      return 'cancelled'
    case 'inactive':
      return 'expired'
    case 'future':
      return 'incomplete'
    default:
      return 'active'
  }
}

function transformItem(item: RawPagarmeSubscriptionItem): SubscriptionItem {
  return {
    id: String(item.id ?? ''),
    quantity: item.quantity ?? undefined,
    amount: item.pricing_scheme?.price ?? undefined,
    metadata: strMap(item.metadata),
  }
}

export function transformSubscription(raw: RawPagarmeSubscription): Subscription {
  const cycle = raw.current_cycle
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.code ?? raw.id ?? ''),
    customerId: String(raw.customer?.id ?? ''),
    status: mapStatus(raw.status),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: (raw.items ?? []).map(transformItem),
    currentPeriodStart: toIsoDatetime(cycle?.start_at),
    currentPeriodEnd: toIsoDatetime(cycle?.end_at),
    trialStart: undefined,
    trialEnd: undefined,
    cancelAt: undefined,
    cancelledAt: toIsoDatetime(raw.canceled_at),
    cancelAtPeriodEnd: undefined,
    collectionMethod:
      raw.billing_type === 'prepaid' ? 'charge_automatically' : undefined,
    defaultPaymentMethodId: raw.card?.id ? String(raw.card.id) : undefined,
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      code: raw.code,
      billing_type: raw.billing_type,
      interval: raw.interval,
      interval_count: raw.interval_count,
      payment_method: raw.payment_method,
      statement_descriptor: raw.statement_descriptor,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
