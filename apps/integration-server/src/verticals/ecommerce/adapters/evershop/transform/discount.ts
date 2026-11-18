/**
 * EverShop Coupon → canonical Discount.
 *
 * EverShop calls discounts "coupons". Each coupon has a single redeemable
 * code, a `discount_type` ('fixed' | 'percentage' | 'buy_x_get_y'), a
 * `discount_amount`, and optional usage limits.
 *
 * Docs: https://evershop.io/docs/api/promotion
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEverShopCoupon {
  coupon_id?: number | string
  uuid?: string
  coupon?: string | null
  status?: number | string | boolean | null
  description?: string | null
  discount_amount?: number | string | null
  free_shipping?: number | string | boolean | null
  discount_type?: string | null
  used_time?: number | null
  max_uses_time_per_coupon?: number | string | null
  max_uses_time_per_customer?: number | string | null
  start_date?: string | null
  end_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  condition?: {
    order_total?: number | string | null
    [key: string]: unknown
  } | null
  target_products?: {
    products?: Array<number | string>
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DISCOUNT_TYPE_MAP: Record<string, DiscountType> = {
  fixed: 'FIXED_AMOUNT',
  percentage: 'PERCENTAGE',
  buy_x_get_y: 'BUY_X_GET_Y',
}

function mapDiscountType(raw: string | null | undefined): DiscountType | undefined {
  if (!raw) return undefined
  return DISCOUNT_TYPE_MAP[raw.toLowerCase()] ?? undefined
}

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

function mapAppliesTo(raw: RawEverShopCoupon): DiscountAppliesTo | undefined {
  if (raw.free_shipping) return 'SHIPPING'
  const hasProducts =
    raw.target_products?.products && (raw.target_products.products as Array<unknown>).length > 0
  return hasProducts ? 'PRODUCTS' : 'ORDER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawEverShopCoupon): Discount {
  const id = raw.uuid ?? (raw.coupon_id != null ? String(raw.coupon_id) : String(raw.coupon ?? ''))
  const type = mapDiscountType(raw.discount_type)
  const rawAmount = toNum(raw.discount_amount)

  // PERCENTAGE → value is the percentage number (0-100)
  // FIXED_AMOUNT → value is major-unit money → convert to minor units
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawAmount, 'USD') : rawAmount

  const minimumOrderTotal = toNum(raw.condition?.order_total)
  const productIds = raw.target_products?.products?.map((p) => String(p))

  return {
    id,
    code: raw.coupon ?? undefined,
    title: raw.description ?? raw.coupon ?? undefined,
    type,
    value,
    appliesTo: mapAppliesTo(raw),
    productIds: productIds && productIds.length > 0 ? productIds : undefined,
    minimumPurchaseAmount:
      minimumOrderTotal > 0
        ? { amount: majorToMinor(minimumOrderTotal, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.max_uses_time_per_coupon != null ? Number(raw.max_uses_time_per_coupon) : undefined,
    usageCount: raw.used_time ?? undefined,
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: toIsoDatetime(raw.end_date),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → EverShop coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const discountType =
    discount.type === 'PERCENTAGE'
      ? 'percentage'
      : discount.type === 'BUY_X_GET_Y'
        ? 'buy_x_get_y'
        : 'fixed'

  // Canonical FIXED_AMOUNT `value` is in integer minor units (e.g. 1999 for
  // $19.99). EverShop expects a decimal major-unit value (19.99). Convert back
  // using the currency from the discount (defaulting to USD). Percentage and
  // other types store the raw number as-is and need no conversion.
  const currency = discount.currency ?? 'USD'
  const discountAmount =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? (minorToMajor(discount.value, currency) ?? 0)
      : (discount.value ?? 0)

  return {
    coupon: discount.code,
    status: 1,
    description: discount.title,
    discount_amount: discountAmount,
    free_shipping: discount.appliesTo === 'SHIPPING' ? 1 : 0,
    discount_type: discountType,
    max_uses_time_per_coupon: discount.usageLimit?.toString(),
    start_date: discount.startsAt,
    end_date: discount.endsAt,
  }
}
