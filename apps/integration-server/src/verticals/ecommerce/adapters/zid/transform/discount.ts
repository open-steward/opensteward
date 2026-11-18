/**
 * Zid Coupon → canonical Discount.
 *
 * Zid refers to discounts as "coupons". The documented Merchant API exposes
 * coupon management, and coupon details appear on orders under `coupon.code`.
 *
 * Discount type and value maps to canonical Discount via the coupon object.
 * Zid coupon endpoint: GET /v1/managers/store/coupons (not always listed but
 * consistent with the rest of the API's naming convention).
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Zid shape ────────────────────────────────────────────────────────────

export interface RawZidCoupon {
  id?: number | string
  code?: string
  title?: string | null
  discount_type?: string | null // "percentage" | "fixed" | "free_shipping"
  discount_value?: number | string
  minimum_order_amount?: number | string | null
  usage_limit?: number | null
  used_count?: number
  expires_at?: string | null
  starts_at?: string | null
  is_active?: boolean
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(t: string | null | undefined): DiscountType | undefined {
  if (!t) return undefined
  const lower = t.toLowerCase()
  if (lower === 'percentage') return 'PERCENTAGE'
  if (lower === 'fixed' || lower === 'fixed_amount') return 'FIXED_AMOUNT'
  if (lower === 'free_shipping') return 'FREE_SHIPPING'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawZidCoupon): Discount {
  const type = mapType(raw.discount_type)
  const rawValue = toNum(raw.discount_value)
  // Fixed-amount values are major-unit SAR → convert to minor units.
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(rawValue, 'SAR')
      : rawValue

  const minAmount = toNum(raw.minimum_order_amount)

  return {
    id: String(raw.id ?? ''),
    code: raw.code,
    title: raw.title ?? raw.code,
    type,
    value,
    appliesTo: type === 'FREE_SHIPPING' ? 'SHIPPING' : 'ORDER',
    minimumPurchaseAmount:
      minAmount > 0 ? { amount: majorToMinor(minAmount, 'SAR'), currency: 'SAR' } : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.used_count,
    startsAt: raw.starts_at ?? undefined,
    endsAt: raw.expires_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Zid coupon create/update body. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    code: discount.code,
    title: discount.title,
    discount_type:
      discount.type === 'PERCENTAGE'
        ? 'percentage'
        : discount.type === 'FREE_SHIPPING'
          ? 'free_shipping'
          : 'fixed',
    discount_value:
      discount.type === 'FIXED_AMOUNT'
        ? minorToMajor(discount.value, discount.currency ?? 'SAR')
        : discount.value,
    minimum_order_amount: minorToMajor(
      discount.minimumPurchaseAmount?.amount,
      discount.minimumPurchaseAmount?.currency ?? discount.currency ?? 'SAR',
    ),
    usage_limit: discount.usageLimit,
    starts_at: discount.startsAt,
    expires_at: discount.endsAt,
    is_active: true,
  }
}
