/**
 * Znode Promotion → canonical Discount.
 *
 * Znode promotions live at `/api/promotions` and support coupon-based
 * discounts with various types. Canonical DiscountType mapping:
 *
 *  - Percentage             → PERCENTAGE
 *  - FixedAmount / Amount   → FIXED_AMOUNT
 *  - FreeShipping           → FREE_SHIPPING
 *  - BuyXGetY               → BUY_X_GET_Y
 *
 * Note: Znode customer-specific pricing (B2B tiered pricing) is NOT
 * modeled as canonical discounts — they represent a separate B2B concept.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawZnodePromotion {
  PromotionId?: number
  PromotionName?: string
  Description?: string
  IsActive?: boolean
  Priority?: number
  CouponCode?: string
  DiscountType?: string
  DiscountAmount?: number
  CurrencyCode?: string
  MinimumOrderAmount?: number
  MaxUsage?: number
  CurrentUsageCount?: number
  StartDate?: string
  EndDate?: string
  CreatedDate?: string
  AppliesTo?: string
  ProductIds?: number[]
  CategoryIds?: number[]
  [key: string]: unknown
}

function mapType(raw: RawZnodePromotion): DiscountType | undefined {
  const dt = raw.DiscountType?.toLowerCase()
  if (!dt) return undefined
  if (dt.includes('percent')) return 'PERCENTAGE'
  if (dt.includes('freeshipping') || dt.includes('free_shipping') || dt.includes('shipping')) return 'FREE_SHIPPING'
  if (dt.includes('buy') && dt.includes('get')) return 'BUY_X_GET_Y'
  if (dt.includes('amount') || dt.includes('fixed')) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawZnodePromotion): DiscountAppliesTo | undefined {
  const applies = raw.AppliesTo?.toLowerCase()
  if (!applies) {
    // Infer from discount type
    const dt = raw.DiscountType?.toLowerCase()
    if (!dt) return undefined
    if (dt.includes('shipping')) return 'SHIPPING'
    if (dt.includes('order') || dt.includes('cart')) return 'ORDER'
    return 'PRODUCTS'
  }
  if (applies.includes('shipping')) return 'SHIPPING'
  if (applies.includes('order') || applies.includes('cart')) return 'ORDER'
  return 'PRODUCTS'
}

export function transformDiscount(raw: RawZnodePromotion): Discount {
  const type = mapType(raw)
  // FIXED_AMOUNT values are money amounts → minor units; percentages stay as-is.
  const value =
    type === 'FIXED_AMOUNT' && raw.DiscountAmount != null
      ? majorToMinor(raw.DiscountAmount, raw.CurrencyCode ?? 'USD')
      : raw.DiscountAmount
  return {
    id: String(raw.PromotionId ?? ''),
    code: raw.CouponCode,
    title: raw.PromotionName,
    type,
    value,
    currency: raw.CurrencyCode,
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      raw.MinimumOrderAmount != null
        ? {
            amount: majorToMinor(raw.MinimumOrderAmount, raw.CurrencyCode ?? 'USD'),
            currency: raw.CurrencyCode ?? 'USD',
          }
        : undefined,
    usageLimit: raw.MaxUsage,
    usageCount: raw.CurrentUsageCount,
    productIds: raw.ProductIds?.map(String),
    startsAt: raw.StartDate,
    endsAt: raw.EndDate,
    createdAt: toIsoDatetime(raw.CreatedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let discountType: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      discountType = 'Percentage'
      break
    case 'FIXED_AMOUNT':
      discountType = 'FixedAmount'
      break
    case 'FREE_SHIPPING':
      discountType = 'FreeShipping'
      break
    case 'BUY_X_GET_Y':
      discountType = 'BuyXGetY'
      break
    default:
      break
  }

  return {
    PromotionName: discount.title ?? discount.code ?? 'Promotion',
    IsActive: true,
    CouponCode: discount.code,
    DiscountType: discountType,
    DiscountAmount:
      discount.type === 'FIXED_AMOUNT' && discount.value != null
        ? discount.value / 100
        : discount.value,
    CurrencyCode: discount.currency,
    StartDate: discount.startsAt,
    EndDate: discount.endsAt,
    MaxUsage: discount.usageLimit,
  }
}
