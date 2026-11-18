/**
 * Rakuten RMS CouponAPI coupon → canonical Discount.
 *
 * Rakuten sellers can issue coupons (shop coupons) through the CouponAPI.
 * A coupon maps cleanly to the canonical Discount type.
 *
 * Key fields:
 *   - `couponCode`      — redeemable coupon code
 *   - `couponName`      — display name
 *   - `discountType`    — 1=fixed amount, 2=percentage, 4=free shipping
 *   - `discountFactor`  — integer: % for type 2, JPY amount for type 1
 *   - `couponStartDate` — ISO datetime start
 *   - `couponEndDate`   — ISO datetime end (null = no expiry)
 *
 * Docs (RMS API list):
 *   https://webservice.rms.rakuten.co.jp/merchant-portal/view?contents=/en/web-service/api-list
 * Source (open-source .NET client):
 *   https://github.com/JakeJP/Rakuten.RMS.Api
 *
 * Endpoints used:
 *   GET https://api.rms.rakuten.co.jp/es/1.0/coupon/search
 *       → { allCount, Content: { coupons: [...] } }
 *   GET https://api.rms.rakuten.co.jp/es/1.0/coupon/get?couponCode={code}
 *       → { coupon: { ... } }
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

/**
 * Rakuten coupon discount type:
 *   1 = fixed amount (JPY)
 *   2 = percentage
 *   4 = free shipping
 */
type RakutenDiscountType = 1 | 2 | 4

export interface RakutenCoupon {
  couponCode?: string
  couponName?: string
  /** 1=fixed, 2=percentage, 4=free_shipping */
  discountType?: RakutenDiscountType
  /** Discount magnitude: JPY for type 1, percent for type 2 */
  discountFactor?: number
  couponStartDate?: string
  couponEndDate?: string | null
  /** Minimum purchase amount in JPY (0 = no minimum) */
  minimumOrderAmount?: number
  /** Total issuance limit (0 = unlimited) */
  issuanceLimit?: number
  /** Number of coupons already used */
  usedCount?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDiscountType(type: RakutenDiscountType | undefined): DiscountType | undefined {
  if (type === 1) return 'FIXED_AMOUNT'
  if (type === 2) return 'PERCENTAGE'
  if (type === 4) return 'FREE_SHIPPING'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RakutenCoupon): Discount {
  const canonicalType = mapDiscountType(raw.discountType)
  const currency = DEFAULT_CURRENCY

  const minimumPurchaseAmount =
    raw.minimumOrderAmount != null && raw.minimumOrderAmount > 0
      ? { amount: raw.minimumOrderAmount, currency }
      : undefined

  return {
    id: raw.couponCode ?? 'rakuten-coupon',
    code: raw.couponCode,
    title: raw.couponName,
    type: canonicalType,
    value: raw.discountFactor,
    currency: canonicalType === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: 'ORDER',
    minimumPurchaseAmount,
    usageLimit:
      raw.issuanceLimit != null && raw.issuanceLimit > 0 ? raw.issuanceLimit : undefined,
    usageCount: raw.usedCount,
    startsAt: raw.couponStartDate ?? undefined,
    endsAt: raw.couponEndDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
