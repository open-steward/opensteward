/**
 * SAP Commerce Cloud Promotion → canonical Discount.
 *
 * SAP Commerce has a complex promotion engine supporting:
 *  - Product promotions (buy X get Y, percentage off, etc.)
 *  - Order promotions (order threshold discounts, free shipping, etc.)
 *  - Coupon-based promotions (code required)
 *
 * The OCC API exposes promotions via `/promotions` endpoints. This
 * transform maps SAP promotion data to the canonical Discount schema.
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapPromotion {
  code?: string
  title?: string
  description?: string
  promotionType?: string
  startDate?: string
  endDate?: string
  enabled?: boolean
  priority?: number
  promotionGroup?: string
  firedMessages?: string[]
  couldFireMessages?: string[]
  restrictions?: Array<{
    restrictionType?: string
    [key: string]: unknown
  }>
  productBanner?: { url?: string }
  [key: string]: unknown
}

export interface RawSapCoupon {
  couponId?: string
  name?: string
  startDate?: string
  endDate?: string
  active?: boolean
  maxRedemptionsPerCustomer?: number
  maxTotalRedemptions?: number
  [key: string]: unknown
}

function mapDiscountType(raw: RawSapPromotion): DiscountType {
  const desc = (raw.description ?? '').toLowerCase()
  const type = (raw.promotionType ?? '').toLowerCase()
  if (desc.includes('free shipping') || desc.includes('free delivery')) return 'FREE_SHIPPING'
  if (desc.includes('buy') && desc.includes('get')) return 'BUY_X_GET_Y'
  if (desc.includes('%') || desc.includes('percent')) return 'PERCENTAGE'
  if (type.includes('product')) return 'PERCENTAGE'
  return 'FIXED_AMOUNT'
}

function mapAppliesTo(raw: RawSapPromotion): DiscountAppliesTo {
  const type = (raw.promotionType ?? '').toLowerCase()
  if (type.includes('order')) return 'ORDER'
  if (type.includes('shipping') || type.includes('delivery')) return 'SHIPPING'
  return 'PRODUCTS'
}

export function transformDiscount(
  raw: RawSapPromotion,
  coupon?: RawSapCoupon,
): Discount {
  return {
    id: raw.code ?? '',
    code: coupon?.couponId,
    title: raw.title ?? raw.description,
    type: mapDiscountType(raw),
    appliesTo: mapAppliesTo(raw),
    startsAt: raw.startDate ?? coupon?.startDate,
    endsAt: raw.endDate ?? coupon?.endDate,
    usageLimit: coupon?.maxTotalRedemptions,
    createdAt: toIsoDatetime(raw.startDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  return {
    code: discount.id,
    title: discount.title,
    description: discount.title,
    startDate: discount.startsAt,
    endDate: discount.endsAt,
    enabled: true,
  }
}
