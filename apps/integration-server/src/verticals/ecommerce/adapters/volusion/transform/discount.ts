/**
 * Volusion Coupon → canonical Discount.
 *
 * Volusion has a basic coupon system with percentage and fixed-amount types.
 * Limited surface compared to Shopify's price rules.
 */

import type {
  Discount,
  DiscountType,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawVolusionCoupon {
  CouponID: number | string
  CouponCode?: string
  CouponName?: string
  DiscountType?: string | null // 'Percentage' | 'Fixed Amount' | 'Free Shipping'
  DiscountAmount?: number | string | null
  MinimumOrder?: number | string | null
  UsageLimit?: number | null
  UsageCount?: number | null
  StartDate?: string | null
  EndDate?: string | null
  DateCreated?: string | null
  IsActive?: boolean
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: string | null | undefined): DiscountType | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower.includes('percent')) return 'PERCENTAGE'
  if (lower.includes('fixed')) return 'FIXED_AMOUNT'
  if (lower.includes('shipping') || lower.includes('free')) return 'FREE_SHIPPING'
  return undefined
}

export function transformDiscount(raw: RawVolusionCoupon): Discount {
  const minimumAmount = toNum(raw.MinimumOrder)
  const type = mapType(raw.DiscountType)
  const rawValue = Math.abs(toNum(raw.DiscountAmount))
  // FIXED_AMOUNT values are money amounts → minor units; percentages stay as-is.
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, 'USD') : rawValue

  return {
    id: String(raw.CouponID),
    code: raw.CouponCode,
    title: raw.CouponName,
    type,
    value,
    appliesTo: raw.DiscountType?.toLowerCase().includes('shipping') ? 'SHIPPING' : 'ORDER',
    minimumPurchaseAmount:
      minimumAmount > 0
        ? { amount: majorToMinor(minimumAmount, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.UsageLimit ?? undefined,
    usageCount: raw.UsageCount ?? undefined,
    startsAt: raw.StartDate ?? undefined,
    endsAt: raw.EndDate ?? undefined,
    createdAt: raw.DateCreated ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let discountType = 'Percentage'
  if (discount.type === 'FIXED_AMOUNT') discountType = 'Fixed Amount'
  else if (discount.type === 'FREE_SHIPPING') discountType = 'Free Shipping'

  return {
    CouponCode: discount.code,
    CouponName: discount.title,
    DiscountType: discountType,
    DiscountAmount: discount.value,
    MinimumOrder: discount.minimumPurchaseAmount?.amount,
    UsageLimit: discount.usageLimit,
    StartDate: discount.startsAt,
    EndDate: discount.endsAt,
  }
}
