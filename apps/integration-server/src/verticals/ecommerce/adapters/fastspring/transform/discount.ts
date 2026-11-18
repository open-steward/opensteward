/**
 * FastSpring Coupon → canonical Discount.
 *
 * Docs:
 *  - https://developer.fastspring.com/reference/coupons-overview
 *  - https://developer.fastspring.com/reference/retrieve-a-coupon
 *  - https://developer.fastspring.com/reference/create-or-update-coupon
 *
 * FastSpring coupons can carry `discount.hasMultipleDiscounts: true` with a
 * per-product tiered `discounts[]` array. Canonical `Discount` has one
 * type/value pair, so a multi-discount coupon surfaces its FIRST tier here
 * — the full breakdown always survives in `metadata`.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawFastSpringCouponDiscountTier {
  type?: string
  percent?: number
  amount?: Record<string, number>
  products?: string[]
}

export interface RawFastSpringCouponDiscount extends RawFastSpringCouponDiscountTier {
  hasMultipleDiscounts?: boolean
  discounts?: RawFastSpringCouponDiscountTier[]
}

export interface RawFastSpringCoupon {
  coupon: string
  discount?: RawFastSpringCouponDiscount
  orderLevelDiscount?: boolean
  reason?: Record<string, string>
  limit?: string | number
  available?: { start?: string; end?: string }
  codes?: string[]
  products?: string[]
  [key: string]: unknown
}

/**
 * A flat-amount coupon prices itself in a map of REAL, present currencies
 * (e.g. `{ USD: 10, EUR: 9, GBP: 8 }` — see the docs). Preferring `USD` when
 * it's one of them, and otherwise taking whichever currency actually is
 * present, is a selection rule over real data — not an invented default:
 * every value this can return was reported by FastSpring for this exact
 * coupon.
 */
function pickCurrency(amount: Record<string, number> | undefined): string | undefined {
  if (!amount) return undefined
  if ('USD' in amount) return 'USD'
  return Object.keys(amount)[0]
}

function mapType(tier: RawFastSpringCouponDiscountTier | undefined): DiscountType | undefined {
  if (tier?.type === 'percent') return 'PERCENTAGE'
  if (tier?.type === 'flat') return 'FIXED_AMOUNT'
  return undefined
}

export function transformDiscount(raw: RawFastSpringCoupon): Discount {
  // A multi-tier coupon has no top-level type/percent/amount — use its
  // first tier as the canonical representative.
  const tier: RawFastSpringCouponDiscountTier | undefined = raw.discount?.hasMultipleDiscounts
    ? raw.discount.discounts?.[0]
    : raw.discount
  const type = mapType(tier)
  const currency = type === 'FIXED_AMOUNT' ? pickCurrency(tier?.amount) : undefined
  // `currency`, when set, was picked FROM the keys of `tier.amount` (see
  // pickCurrency), so the lookup below is always a real, present value —
  // never a guessed default.
  const value =
    type === 'PERCENTAGE'
      ? tier?.percent
      : type === 'FIXED_AMOUNT' && currency
        ? majorToMinor(tier!.amount![currency]!, currency)
        : undefined

  const appliesTo: DiscountAppliesTo | undefined = raw.orderLevelDiscount
    ? 'ORDER'
    : raw.products && raw.products.length > 0
      ? 'PRODUCTS'
      : undefined

  const usageLimit =
    raw.limit != null && raw.limit !== '' ? Number(raw.limit) : undefined

  return {
    id: raw.coupon,
    code: raw.codes?.[0],
    title: raw.reason?.['en'],
    type,
    value,
    currency,
    appliesTo,
    productIds: raw.products && raw.products.length > 0 ? raw.products : undefined,
    usageLimit: usageLimit != null && !Number.isNaN(usageLimit) ? usageLimit : undefined,
    startsAt: toIsoDatetime(raw.available?.start),
    endsAt: toIsoDatetime(raw.available?.end),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Discount → FastSpring coupon upsert body (`POST /coupons`). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = { coupon: discount.id }
  if (discount.appliesTo === 'ORDER') body['orderLevelDiscount'] = true

  if (discount.type === 'PERCENTAGE' && discount.value != null) {
    body['discount'] = { type: 'percent', percent: discount.value }
  } else if (discount.type === 'FIXED_AMOUNT' && discount.value != null) {
    if (!discount.currency) {
      throw new Error(
        `Cannot build a FastSpring flat-amount coupon for "${discount.id}" — discount.currency is required (FastSpring prices flat discounts per-currency; there is no default to send).`,
      )
    }
    const currency = discount.currency
    body['discount'] = { type: 'flat', amount: { [currency]: minorToMajor(discount.value, currency) } }
  }

  if (discount.title) body['reason'] = { en: discount.title }
  if (discount.usageLimit != null) body['limit'] = discount.usageLimit
  if (discount.startsAt || discount.endsAt) {
    body['available'] = {
      start: discount.startsAt?.slice(0, 10),
      end: discount.endsAt?.slice(0, 10),
    }
  }
  if (discount.code) body['codes'] = [discount.code]
  if (discount.productIds) body['products'] = discount.productIds
  return body
}
