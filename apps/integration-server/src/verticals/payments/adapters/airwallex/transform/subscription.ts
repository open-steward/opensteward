/**
 * Airwallex Subscription → canonical Subscription.
 *
 * Airwallex Billing subscriptions live at `/api/v1/subscriptions`. Each
 * subscription is linked to a `billing_customer_id` (Billing-layer customer).
 * Items reference a `price_id` in the Airwallex Prices catalog.
 *
 * Status values (uppercase from Airwallex):
 *   PENDING | IN_TRIAL | ACTIVE | PAST_DUE | CANCELLED | EXPIRED | PAUSED
 *
 * Timestamps (starts_at, ends_at, trial_ends_at) are ISO-8601 strings.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/billing/subscriptions
 *   https://www.airwallex.com/docs/billing/subscriptions/subscriptions-via-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionItem,
} from '../../../schema/subscription'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawAirwallexSubscriptionItem {
  id?: string
  price_id?: string
  product_id?: string
  quantity?: number
  unit_amount?: number   // major units (price-level amount)
  currency?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

export interface RawAirwallexSubscription {
  id?: string
  billing_customer_id?: string
  status?: string            // PENDING | IN_TRIAL | ACTIVE | PAST_DUE | CANCELLED | EXPIRED | PAUSED
  currency?: string
  collection_method?: string // AUTO_CHARGE | CHARGE_ON_CHECKOUT | OUT_OF_BAND
  default_payment_method_id?: string
  latest_invoice_id?: string
  items?: RawAirwallexSubscriptionItem[]
  starts_at?: string
  ends_at?: string           // current period end
  trial_ends_at?: string
  cancel_at?: string
  cancelled_at?: string
  cancel_at_period_end?: boolean
  dunning_state?: string
  days_until_due?: number
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(s: string | undefined): SubscriptionStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'IN_TRIAL':
      return 'trialing'
    case 'ACTIVE':
      return 'active'
    case 'PAST_DUE':
      return 'past_due'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'PAUSED':
      return 'paused'
    case 'PENDING':
      return 'incomplete'
    default:
      return 'incomplete'
  }
}

function mapCollectionMethod(
  v: string | undefined,
): 'charge_automatically' | 'send_invoice' | undefined {
  const s = (v ?? '').toUpperCase()
  if (s === 'AUTO_CHARGE') return 'charge_automatically'
  if (s === 'OUT_OF_BAND' || s === 'CHARGE_ON_CHECKOUT') return 'send_invoice'
  return undefined
}

function mapItems(raw: RawAirwallexSubscriptionItem[]): SubscriptionItem[] {
  return raw.map((item) => ({
    id: String(item.id ?? item.price_id ?? ''),
    priceId: item.price_id ?? undefined,
    productId: item.product_id ?? undefined,
    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
    amount:
      typeof item.unit_amount === 'number' ? toMinorUnits(item.unit_amount) : undefined,
    metadata: item.metadata
      ? strMap(item.metadata)
      : undefined,
  }))
}

export function transformSubscription(raw: RawAirwallexSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.billing_customer_id ?? ''),
    status: mapStatus(raw.status),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: mapItems(raw.items ?? []),
    // starts_at = billing anchor; ends_at = current period end
    currentPeriodStart: toIsoDatetime(raw.starts_at),
    currentPeriodEnd: toIsoDatetime(raw.ends_at),
    billingAnchor: toIsoDatetime(raw.starts_at),
    trialStart: undefined,
    trialEnd: toIsoDatetime(raw.trial_ends_at),
    cancelAt: toIsoDatetime(raw.cancel_at),
    cancelledAt: toIsoDatetime(raw.cancelled_at),
    cancelAtPeriodEnd: raw.cancel_at_period_end ?? undefined,
    collectionMethod: mapCollectionMethod(raw.collection_method),
    dunningState: raw.dunning_state ?? undefined,
    defaultPaymentMethodId: raw.default_payment_method_id ?? undefined,
    latestInvoiceId: raw.latest_invoice_id ?? undefined,
    gateway: 'airwallex',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
