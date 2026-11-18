/**
 * Allegro seller rebate (promotion) → canonical Discount.
 *
 * Source, per https://developer.allegro.pl/swagger.yaml:
 *   GET /sale/loyalty/promotions?promotionType=… → SellerRebatesDto
 *     `{ promotions: SellerRebateDto[], totalCount }`
 *   GET /sale/loyalty/promotions/{promotionId} → SellerRebateDto
 *
 * SellerRebateDto (required: benefits, id, offerCriteria, status):
 *   - `benefits[].specification` is one of, by `type`:
 *       LARGE_ORDER_DISCOUNT     `thresholds[]: { orderValue.lowerBound: Price,
 *                                 discount.percentage: string }`
 *       WHOLESALE_PRICE_LIST     `name`, `thresholds[]: { quantity.lowerBound,
 *                                 discount.percentage: string }`
 *       UNIT_PERCENTAGE_DISCOUNT `configuration.percentage: number` ("a
 *                                 MULTIPACK or CROSS_MULTIPACK discount")
 *   - `offerCriteria[]`: `type` CONTAINS_OFFERS | OFFERS_ASSIGNED_EXTERNALLY |
 *     ALL_OFFERS, `offers[].id` "only if `type` is `CONTAINS_OFFERS`"
 *   - `createdAt` "when was this rebate created"
 *
 * `type` follows the specification:
 *   - LARGE_ORDER_DISCOUNT / WHOLESALE_PRICE_LIST take `discount.percentage`
 *     off the order or unit price, so they are PERCENTAGE. A tiered rebate
 *     (more than one threshold) has no single value and leaves `value` out.
 *   - UNIT_PERCENTAGE_DISCOUNT (MultiPackBenefitSpecification) discounts
 *     `trigger.discountedNumber` ("how many offers in pack should be
 *     discounted by discount percentage") "For every pack of this quantity"
 *     (`trigger.forEachQuantity`): a buy-X-get-Y shape, not a percentage off
 *     the purchase. It maps to BUY_X_GET_Y with `value` left out; the raw
 *     specification stays in `metadata`.
 *   - any other specification leaves `type` and `value` out.
 */

import type { Discount } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawAllegroPrice {
  amount: string
  currency: string
}

export interface RawAllegroPromotionThreshold {
  orderValue?: { lowerBound?: RawAllegroPrice }
  quantity?: { lowerBound?: number }
  discount?: { percentage?: string }
}

export interface RawAllegroBenefitSpecification {
  type: string
  name?: string
  thresholds?: RawAllegroPromotionThreshold[]
  configuration?: { percentage?: number }
  trigger?: { forEachQuantity?: number; discountedNumber?: number }
}

export interface RawAllegroPromotion {
  id: string
  status?: string
  createdAt?: string
  benefits?: Array<{ specification?: RawAllegroBenefitSpecification }>
  offerCriteria?: Array<{ type?: string; offers?: Array<{ id: string }> }>
  [key: string]: unknown
}

function thresholdPercent(spec: RawAllegroBenefitSpecification): number | undefined {
  const thresholds = spec.thresholds ?? []
  if (thresholds.length !== 1) return undefined
  const text = thresholds[0]!.discount?.percentage
  if (text === undefined) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

function minimumOrderValue(
  spec: RawAllegroBenefitSpecification,
): Discount['minimumPurchaseAmount'] {
  if (spec.type !== 'LARGE_ORDER_DISCOUNT') return undefined
  const thresholds = spec.thresholds ?? []
  if (thresholds.length !== 1) return undefined
  const bound = thresholds[0]!.orderValue?.lowerBound
  if (!bound) return undefined
  const n = Number.parseFloat(bound.amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, bound.currency), currency: bound.currency }
}

// `offers` is present "only if `type` is `CONTAINS_OFFERS`".
function offerIds(raw: RawAllegroPromotion): string[] {
  const ids: string[] = []
  for (const c of raw.offerCriteria ?? []) {
    for (const o of c.offers ?? []) ids.push(o.id)
  }
  return ids
}

function typeAndValue(
  spec: RawAllegroBenefitSpecification | undefined,
): Pick<Discount, 'type' | 'value'> {
  switch (spec?.type) {
    case 'LARGE_ORDER_DISCOUNT':
    case 'WHOLESALE_PRICE_LIST': {
      const value = thresholdPercent(spec)
      return value === undefined ? { type: 'PERCENTAGE' } : { type: 'PERCENTAGE', value }
    }
    case 'UNIT_PERCENTAGE_DISCOUNT':
      return { type: 'BUY_X_GET_Y' }
    default:
      return {}
  }
}

export function transformDiscount(raw: RawAllegroPromotion): Discount {
  const spec = raw.benefits?.[0]?.specification
  const productIds = offerIds(raw)
  const minimum = spec ? minimumOrderValue(spec) : undefined
  return {
    id: raw.id,
    title: spec?.name,
    ...typeAndValue(spec),
    ...(productIds.length > 0 ? { appliesTo: 'PRODUCTS' as const, productIds } : {}),
    ...(minimum ? { minimumPurchaseAmount: minimum } : {}),
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
