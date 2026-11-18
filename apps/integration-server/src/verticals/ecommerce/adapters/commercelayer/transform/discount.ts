/**
 * Commerce Layer Promotion → canonical Discount.
 *
 * Commerce Layer has several promotion types:
 *   - percentage_discount_promotions
 *   - fixed_amount_promotions
 *   - free_shipping_promotions
 *   - fixed_price_promotions
 *   - buy_x_pay_y_promotions
 *   - free_gift_promotions
 *   - external_promotions
 *
 * The `type` field distinguishes them. All share common attributes like
 * `name`, `starts_at`, `expires_at`, `total_usage_limit`, `total_usage_count`.
 *
 * Coupon codes are separate resources linked to promotions.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawCLPromotion {
  id: string
  name?: string
  currency_code?: string
  starts_at?: string
  expires_at?: string
  total_usage_limit?: number
  total_usage_count?: number
  created_at?: string
  updated_at?: string
  // Type-specific fields
  percentage?: number
  fixed_amount_cents?: number
  fixed_amount_float?: number
  // The JSON:API type tells us the promotion kind
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapType(clType: string | undefined): DiscountType | undefined {
  if (!clType) return undefined
  const t = clType.toLowerCase()
  if (t.includes('percentage')) return 'PERCENTAGE'
  if (t.includes('free_shipping')) return 'FREE_SHIPPING'
  if (t.includes('buy_x_pay_y') || t.includes('free_gift')) return 'BUY_X_GET_Y'
  if (t.includes('fixed_amount') || t.includes('fixed_price')) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(clType: string | undefined): DiscountAppliesTo | undefined {
  if (!clType) return undefined
  const t = clType.toLowerCase()
  if (t.includes('shipping')) return 'SHIPPING'
  if (t.includes('fixed_price') || t.includes('buy_x')) return 'PRODUCTS'
  return 'ORDER'
}

function extractValue(raw: RawCLPromotion): number | undefined {
  if (raw.percentage != null) return raw.percentage
  if (raw.fixed_amount_cents != null) return Math.round(raw.fixed_amount_cents)
  if (raw.fixed_amount_float != null)
    return majorToMinor(raw.fixed_amount_float, raw.currency_code)
  return undefined
}

export function transformDiscount(raw: RawCLPromotion): Discount {
  return {
    id: raw.id,
    title: raw.name,
    type: mapType(raw._type),
    value: extractValue(raw),
    currency: raw.currency_code,
    appliesTo: mapAppliesTo(raw._type),
    usageLimit: raw.total_usage_limit,
    usageCount: raw.total_usage_count,
    startsAt: raw.starts_at,
    endsAt: raw.expires_at,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let promotionType = 'promotions'
  let attrs: Record<string, unknown> = {}

  switch (discount.type) {
    case 'PERCENTAGE':
      promotionType = 'percentage_discount_promotions'
      attrs = { percentage: discount.value }
      break
    case 'FIXED_AMOUNT':
      promotionType = 'fixed_amount_promotions'
      attrs = {
        fixed_amount_cents: discount.value != null ? Math.round(discount.value) : undefined,
        currency_code: discount.currency,
      }
      break
    case 'FREE_SHIPPING':
      promotionType = 'free_shipping_promotions'
      break
    case 'BUY_X_GET_Y':
      promotionType = 'buy_x_pay_y_promotions'
      break
    default:
      promotionType = 'percentage_discount_promotions'
      break
  }

  return {
    data: {
      type: promotionType,
      attributes: {
        name: discount.title ?? 'Promotion',
        starts_at: discount.startsAt,
        expires_at: discount.endsAt,
        total_usage_limit: discount.usageLimit,
        currency_code: discount.currency,
        ...attrs,
      },
    },
  }
}
