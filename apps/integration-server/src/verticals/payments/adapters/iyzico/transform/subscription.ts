import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A single order (billing cycle) inside a subscription — returned inside the
 * `orders` array of the subscription detail/list response.
 */
export interface RawIyzicoSubscriptionOrder {
  referenceCode?: string
  parentReferenceCode?: string
  paymentDate?: number | string
  price?: number | string
  currencyCode?: string
  status?: string
  [k: string]: unknown
}

/**
 * iyzico subscription object — returned by
 *   GET /v2/subscription/subscriptions
 *   GET /v2/subscription/subscriptions/{subscriptionReferenceCode}
 *
 * Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions
 */
export interface RawIyzicoSubscription {
  referenceCode?: string
  parentReferenceCode?: string
  pricingPlanName?: string
  pricingPlanReferenceCode?: string
  productName?: string
  productReferenceCode?: string
  customerEmail?: string
  customerGsmNumber?: string
  customerReferenceCode?: string
  /** ACTIVE, PENDING, UNPAID, UPGRADED, CANCELED, EXPIRED */
  subscriptionStatus?: string
  trialDays?: number
  trialStartDate?: number | string
  trialEndDate?: number | string
  createdDate?: number | string
  startDate?: number | string
  endDate?: number | string
  orders?: RawIyzicoSubscriptionOrder[]
  [k: string]: unknown
}

/** Envelope for GET /v2/subscription/subscriptions (list). */
export interface RawIyzicoSubscriptionListResponse {
  status?: string
  systemTime?: number
  data?: {
    totalCount?: number
    currentPage?: number
    pageCount?: number
    items?: RawIyzicoSubscription[]
  }
  [k: string]: unknown
}

/** Envelope for GET /v2/subscription/subscriptions/{id} (single). */
export interface RawIyzicoSubscriptionDetailResponse {
  status?: string
  systemTime?: number
  data?: {
    totalCount?: number
    currentPage?: number
    pageCount?: number
    items?: RawIyzicoSubscription[]
  }
  [k: string]: unknown
}

function mapSubscriptionStatus(raw: string | undefined): SubscriptionStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PENDING':
      return 'incomplete'
    case 'UNPAID':
      return 'past_due'
    case 'UPGRADED':
      return 'active'
    case 'CANCELED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawIyzicoSubscription): Subscription {
  // iyzico stores amounts per order (billing cycle), not on the subscription root.
  // Derive currency from the most recent order when present.
  const latestOrder = (raw.orders ?? []).at(-1)
  const currency = latestOrder?.currencyCode ?? undefined

  return {
    id: String(raw.referenceCode ?? ''),
    externalId: String(raw.referenceCode ?? ''),
    customerId: String(raw.customerReferenceCode ?? ''),
    status: mapSubscriptionStatus(raw.subscriptionStatus),
    currency: currency ? pickCurrency(currency) : undefined,
    items: raw.pricingPlanReferenceCode
      ? [
          {
            id: String(raw.pricingPlanReferenceCode),
            priceId: String(raw.pricingPlanReferenceCode),
            quantity: 1,
            amount: latestOrder ? toMinorUnits(latestOrder.price) : undefined,
          },
        ]
      : [],
    currentPeriodStart: toIsoDatetime(raw.startDate),
    currentPeriodEnd: toIsoDatetime(raw.endDate),
    billingAnchor: toIsoDatetime(raw.startDate),
    trialStart: toIsoDatetime(raw.trialStartDate),
    trialEnd: toIsoDatetime(raw.trialEndDate),
    cancelAt: undefined,
    cancelledAt: undefined,
    cancelAtPeriodEnd: undefined,
    collectionMethod: 'charge_automatically',
    dunningState: undefined,
    defaultPaymentMethodId: undefined,
    latestInvoiceId: undefined,
    gateway: 'iyzico',
    metadata: strMap({
      parentReferenceCode: raw.parentReferenceCode,
      pricingPlanName: raw.pricingPlanName,
      productReferenceCode: raw.productReferenceCode,
      productName: raw.productName,
      customerEmail: raw.customerEmail,
      customerGsmNumber: raw.customerGsmNumber,
      trialDays: raw.trialDays,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: undefined,
    raw,
  }
}
