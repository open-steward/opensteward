/**
 * NHN Commerce (Shopby) Coupon → canonical Discount.
 *
 * Shopby coupon data is accessible (for the authenticated member) via
 * GET /coupons. Each coupon item includes the discount type and amount.
 *
 * Shopby coupon types:
 *   PRODUCT_COUPON  - discount on a specific product
 *   CART_COUPON     - discount on the entire order
 *   DELIVERY_COUPON - free/reduced shipping
 *
 * Discount value types:
 *   WON  / FIXED_AMOUNT - fixed amount off
 *   PERCENT             - percentage off
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from './product'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnCoupon {
  couponNo?: number | string
  couponName?: string | null
  couponType?: string | null  // PRODUCT_COUPON | CART_COUPON | DELIVERY_COUPON
  discountType?: string | null // WON | PERCENT
  discountAmt?: number | null
  discountRate?: number | null
  maxDiscountAmt?: number | null
  minSalePrice?: number | null
  useYn?: string | null
  issueYmdt?: string | null
  usePeriodStartYmdt?: string | null
  usePeriodEndYmdt?: string | null
  usedYmdt?: string | null
  couponTargetType?: string | null // ALL | PRODUCT | CATEGORY | BRAND
  promotionCode?: string | null
  downloadable?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapDiscountType(
  couponType: string | null | undefined,
  discountType: string | null | undefined,
): DiscountType | undefined {
  if (couponType === 'DELIVERY_COUPON') return 'FREE_SHIPPING'
  if (!discountType) return undefined
  if (discountType === 'PERCENT') return 'PERCENTAGE'
  if (discountType === 'WON') return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(couponType: string | null | undefined): DiscountAppliesTo | undefined {
  if (!couponType) return undefined
  if (couponType === 'CART_COUPON') return 'ORDER'
  if (couponType === 'PRODUCT_COUPON') return 'PRODUCTS'
  if (couponType === 'DELIVERY_COUPON') return 'SHIPPING'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCoupon(raw: RawNhnCoupon, currency = DEFAULT_CURRENCY): Discount {
  const discountType = mapDiscountType(raw.couponType, raw.discountType)
  let value: number | undefined
  if (raw.discountType === 'PERCENT') {
    value = raw.discountRate ?? undefined
  } else if (raw.discountType === 'WON') {
    // Fixed amount — convert major units to integer minor units (e.g. KRW stays 1:1).
    value = raw.discountAmt != null ? majorToMinor(raw.discountAmt, currency) : undefined
  }

  return {
    id: String(raw.couponNo ?? ''),
    code: raw.promotionCode ?? undefined,
    title: raw.couponName ?? undefined,
    type: discountType,
    value,
    currency,
    appliesTo: mapAppliesTo(raw.couponType),
    minimumPurchaseAmount: raw.minSalePrice != null
      ? { amount: majorToMinor(raw.minSalePrice, currency), currency }
      : undefined,
    startsAt: toIsoDatetime(raw.usePeriodStartYmdt ?? raw.issueYmdt),
    endsAt: toIsoDatetime(raw.usePeriodEndYmdt),
    createdAt: toIsoDatetime(raw.issueYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
