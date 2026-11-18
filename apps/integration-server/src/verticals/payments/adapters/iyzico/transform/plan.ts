import { toIsoDatetime } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import type { BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * iyzico pricing plan object — returned by
 *   GET /v2/subscription/products/{productReferenceCode}/pricing-plans
 *   GET /v2/subscription/pricing-plans/{pricingPlanReferenceCode}
 *
 * Maps to the canonical Plan resource. iyzico amounts are decimal major units.
 *
 * Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/payment-plan
 */
export interface RawIyzicoplan {
  referenceCode?: string
  createdDate?: number | string
  name?: string
  productReferenceCode?: string
  /** Decimal major units (e.g. "49.99"). */
  price?: number | string
  /** ISO 4217 currency code — TRY, USD, EUR. */
  currencyCode?: string
  /** DAILY, WEEKLY, MONTHLY, YEARLY */
  paymentInterval?: string
  paymentIntervalCount?: number
  planPaymentType?: string
  recurrenceCount?: number
  trialPeriodDays?: number
  /** ACTIVE */
  status?: string
  [k: string]: unknown
}

/** Envelope for the list-plans response. */
export interface RawIyzicoPlanListResponse {
  status?: string
  systemTime?: number
  data?: {
    totalCount?: number
    currentPage?: number
    pageCount?: number
    items?: RawIyzicoplan[]
  }
  [k: string]: unknown
}

/** Envelope for the get-plan-detail response. */
export interface RawIyzicoPlanDetailResponse {
  status?: string
  systemTime?: number
  data?: RawIyzicoplan
  [k: string]: unknown
}

function mapInterval(v: string | undefined): BillingInterval {
  switch ((v ?? '').toUpperCase()) {
    case 'DAILY':
      return 'day'
    case 'WEEKLY':
      return 'week'
    case 'MONTHLY':
      return 'month'
    case 'YEARLY':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawIyzicoplan): Plan {
  return {
    id: String(raw.referenceCode ?? ''),
    externalId: String(raw.referenceCode ?? ''),
    productId: raw.productReferenceCode ? String(raw.productReferenceCode) : undefined,
    nickname: raw.name ?? undefined,
    active: (raw.status ?? '').toUpperCase() === 'ACTIVE',
    amount: toMinorUnits(raw.price) ?? 0,
    currency: pickCurrency(raw.currencyCode),
    interval: mapInterval(raw.paymentInterval),
    intervalCount:
      typeof raw.paymentIntervalCount === 'number' && raw.paymentIntervalCount > 0
        ? raw.paymentIntervalCount
        : 1,
    trialPeriodDays:
      typeof raw.trialPeriodDays === 'number' ? raw.trialPeriodDays : undefined,
    gateway: 'iyzico',
    metadata: strMap({
      planPaymentType: raw.planPaymentType,
      recurrenceCount: raw.recurrenceCount,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: undefined,
    raw,
  }
}
