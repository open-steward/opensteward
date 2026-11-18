/**
 * Maps a Vipps MobilePay Recurring API **agreement** onto the canonical
 * `Subscription`.
 *
 * The Recurring API models recurring billing around an "agreement" — a
 * contract between a merchant and a customer that defines pricing, billing
 * interval, and lifecycle state. This maps cleanly onto the canonical
 * Subscription type.
 *
 * Endpoints:
 *   GET /recurring/v3/agreements          → list (array of agreement objects)
 *   GET /recurring/v3/agreements/{id}     → single agreement
 *
 * Status mapping:
 *   PENDING  → incomplete   (awaiting customer approval)
 *   ACTIVE   → active
 *   STOPPED  → cancelled
 *   EXPIRED  → expired
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/recurring-api/
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toIsoDatetime } from './shared'

export interface RawVippsAgreementPricing {
  type?: string
  amount?: number
  currency?: string
}

export interface RawVippsAgreementInterval {
  unit?: string
  count?: number
}

export interface RawVippsAgreement {
  /** Agreement identifier (the canonical subscription id). */
  id?: string
  /** Status: PENDING | ACTIVE | STOPPED | EXPIRED */
  status?: string
  pricing?: RawVippsAgreementPricing
  interval?: RawVippsAgreementInterval
  productName?: string
  productDescription?: string
  /** Pseudonymous user identifier (sub claim). */
  sub?: string
  /** ISO-8601 creation timestamp. */
  created?: string
  /** ISO-8601 start date. */
  start?: string
  /** ISO-8601 stop/cancellation date. */
  stop?: string
  /** Merchant's own reference. */
  externalId?: string
  merchantAgreementUrl?: string
  merchantRedirectUrl?: string
  [k: string]: unknown
}

function mapStatus(raw: RawVippsAgreement): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PENDING':
      return 'incomplete'
    case 'ACTIVE':
      return 'active'
    case 'STOPPED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawVippsAgreement): Subscription {
  const id = raw.id ?? ''
  const pricing = raw.pricing ?? {}
  const interval = raw.interval ?? {}
  const currency = pickCurrency(pricing.currency)

  const item = {
    id: String(id),
    priceId: undefined,
    productId: undefined,
    quantity: 1,
    amount: pricing.amount ?? 0,
    metadata: undefined,
  }

  return {
    id: String(id),
    externalId: String(id),
    customerId: raw.sub ?? '',
    status: mapStatus(raw),
    currency,
    items: [item],
    currentPeriodStart: raw.start ? toIsoDatetime(raw.start) : undefined,
    currentPeriodEnd: undefined,
    billingAnchor: raw.start ? toIsoDatetime(raw.start) : undefined,
    cancelledAt: raw.stop ? toIsoDatetime(raw.stop) : undefined,
    cancelAtPeriodEnd: false,
    gateway: 'vipps-mobilepay',
    metadata: strMap({
      productName: raw.productName,
      intervalUnit: interval.unit,
      intervalCount: interval.count,
      pricingType: pricing.type,
      merchantAgreementUrl: raw.merchantAgreementUrl,
      externalId: raw.externalId,
    }),
    createdAt: raw.created ? toIsoDatetime(raw.created) : undefined,
    raw,
  }
}
