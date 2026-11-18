/**
 * Elastic Path Promotion → canonical Discount.
 *
 * Elastic Path promotions live at `/v2/promotions`. Each promotion has
 * a `promotion_type` (e.g. 'fixed_discount', 'percent_discount',
 * 'x_for_y', 'free_gift', etc.) and a `schema` object with the
 * discount configuration.
 *
 * Codes are managed separately via `/v2/promotions/{id}/codes`.
 *
 * Money values in promotions are integer cents.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEpPromotion {
  id: string
  type: string // promotion
  name?: string
  description?: string
  enabled?: boolean
  promotion_type?: string
  schema?: Record<string, unknown>
  start?: string
  end?: string
  created_at?: string
  updated_at?: string
  min_cart_value?: Array<{ currency?: string; amount?: number }>
  max_discount_value?: Array<{ currency?: string; amount?: number }>
  [key: string]: unknown
}

function mapType(promoType: string | undefined): DiscountType | undefined {
  if (!promoType) return undefined
  const t = promoType.toLowerCase()
  if (t.includes('percent')) return 'PERCENTAGE'
  if (t.includes('fixed') || t.includes('amount')) return 'FIXED_AMOUNT'
  if (t.includes('free_shipping') || t.includes('shipping')) return 'FREE_SHIPPING'
  if (t.includes('x_for_y') || t.includes('buy') || t.includes('bogo')) return 'BUY_X_GET_Y'
  return 'FIXED_AMOUNT'
}

function mapAppliesTo(promoType: string | undefined): DiscountAppliesTo | undefined {
  if (!promoType) return undefined
  const t = promoType.toLowerCase()
  if (t.includes('shipping')) return 'SHIPPING'
  if (t.includes('cart') || t.includes('order')) return 'ORDER'
  return 'PRODUCTS'
}

function extractValue(raw: RawEpPromotion): { value?: number; currency?: string } {
  const schema = raw.schema
  if (!schema) return {}
  // Promotions may have percentage or amount in the schema
  const pct = schema['percentage'] as number | undefined
  if (pct != null) return { value: pct }
  const currencies = schema['currencies'] as Array<{ currency?: string; amount?: number }> | undefined
  const first = currencies?.[0]
  if (first?.amount != null) {
    return { value: Math.round(first.amount), currency: first.currency }
  }
  return {}
}

export function transformDiscount(raw: RawEpPromotion): Discount {
  const { value, currency } = extractValue(raw)
  const minCart = raw.min_cart_value?.[0]
  return {
    id: raw.id,
    title: raw.name,
    type: mapType(raw.promotion_type),
    value,
    currency,
    appliesTo: mapAppliesTo(raw.promotion_type),
    minimumPurchaseAmount:
      minCart?.amount != null
        ? { amount: Math.round(minCart.amount), currency: minCart.currency ?? 'USD' }
        : undefined,
    startsAt: raw.start,
    endsAt: raw.end,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let promotionType: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      promotionType = 'percent_discount'
      break
    case 'FIXED_AMOUNT':
      promotionType = 'fixed_discount'
      break
    case 'FREE_SHIPPING':
      promotionType = 'free_shipping'
      break
    case 'BUY_X_GET_Y':
      promotionType = 'x_for_y'
      break
    default:
      break
  }

  return {
    data: {
      type: 'promotion',
      name: discount.title ?? 'Promotion',
      description: discount.title,
      enabled: true,
      promotion_type: promotionType ?? 'fixed_discount',
      start: discount.startsAt,
      end: discount.endsAt,
    },
  }
}
