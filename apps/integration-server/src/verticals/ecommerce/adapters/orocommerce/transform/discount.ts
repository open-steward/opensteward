/**
 * OroCommerce Promotion → canonical Discount.
 *
 * OroCommerce promotions live at `/api/promotions` and use a condition/
 * action model. Canonical DiscountType mapping:
 *
 *  - percentage             → PERCENTAGE
 *  - order_amount / amount  → FIXED_AMOUNT
 *  - shipping               → FREE_SHIPPING
 *  - buy_x_get_y            → BUY_X_GET_Y
 *
 * Note: Oro price lists (tiered B2B pricing) are NOT modeled as
 * canonical discounts — they represent a separate B2B concept.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawOroPromotion {
  id: string
  name?: string
  description?: string
  enabled?: boolean
  sortOrder?: number
  useCoupons?: boolean
  couponCode?: string
  discountType?: string
  discountValue?: number
  discountCurrency?: string
  minimumOrderAmount?: number
  usageLimit?: number
  timesUsed?: number
  startDateTime?: string
  endDateTime?: string
  createdAt?: string
  productsSegment?: { id: string } | null
  customerSegment?: { id: string } | null
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapType(raw: RawOroPromotion): DiscountType | undefined {
  const dt = raw.discountType?.toLowerCase()
  if (!dt) return undefined
  if (dt.includes('percent')) return 'PERCENTAGE'
  if (dt.includes('shipping') || dt.includes('free_shipping')) return 'FREE_SHIPPING'
  if (dt.includes('buy') && dt.includes('get')) return 'BUY_X_GET_Y'
  if (dt.includes('amount') || dt.includes('fixed') || dt.includes('order')) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawOroPromotion): DiscountAppliesTo | undefined {
  const dt = raw.discountType?.toLowerCase()
  if (!dt) return undefined
  if (dt.includes('shipping')) return 'SHIPPING'
  if (dt.includes('order') || dt.includes('cart')) return 'ORDER'
  return 'PRODUCTS'
}

export function transformDiscount(raw: RawOroPromotion): Discount {
  return {
    id: raw.id,
    code: raw.couponCode,
    title: raw.name,
    type: mapType(raw),
    value: raw.discountValue,
    currency: raw.discountCurrency,
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      raw.minimumOrderAmount != null
        ? { amount: majorToMinor(raw.minimumOrderAmount, raw.discountCurrency ?? 'USD'), currency: raw.discountCurrency ?? 'USD' }
        : undefined,
    usageLimit: raw.usageLimit,
    usageCount: raw.timesUsed,
    startsAt: raw.startDateTime,
    endsAt: raw.endDateTime,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let discountType: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      discountType = 'percentage'
      break
    case 'FIXED_AMOUNT':
      discountType = 'order_amount'
      break
    case 'FREE_SHIPPING':
      discountType = 'shipping'
      break
    case 'BUY_X_GET_Y':
      discountType = 'buy_x_get_y'
      break
    default:
      break
  }

  return {
    data: {
      type: 'promotions',
      attributes: {
        name: discount.title ?? discount.code ?? 'Promotion',
        enabled: true,
        useCoupons: !!discount.code,
        couponCode: discount.code,
        discountType,
        discountValue: discount.value,
        discountCurrency: discount.currency,
        startDateTime: discount.startsAt,
        endDateTime: discount.endsAt,
        usageLimit: discount.usageLimit,
      },
    },
  }
}
