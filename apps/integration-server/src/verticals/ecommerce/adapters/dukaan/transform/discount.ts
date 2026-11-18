/**
 * Dukaan coupon → canonical Discount.
 *
 * A row of get_discounts, GET /api/coupon/seller/coupon/v2/, keyed by its
 * `uuid`.
 *
 * The collection documents `discount_type` only as the integer `0` in its
 * examples and never says what the codes mean, so `type` is not mapped, and
 * neither is `value`, whose unit depends on the type. `min_order_value`
 * carries no currency, so `minimumPurchaseAmount` is not mapped either. All
 * of them stay in `metadata`.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Discount } from '../../../schema/discount'
import { minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Dukaan shape (fields as in the documented example response) ──────────

export interface RawDukaanCoupon {
  id: number
  uuid: string
  created_at: string
  modified_at: string
  code: string
  description: string
  discount_type: number
  discount_value: number
  min_order_value: number | null
  start_date: string | null
  expiry_date: string | null
  is_active: boolean
  applicable_on_all_customers: boolean
  times_used: number
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawDukaanCoupon): Discount {
  return {
    id: raw.uuid,
    code: raw.code || undefined,
    title: raw.description || undefined,
    customerEligibility: raw.applicable_on_all_customers === true ? 'ALL' : undefined,
    usageCount: typeof raw.times_used === 'number' ? raw.times_used : undefined,
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: toIsoDatetime(raw.expiry_date),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Write-side body for createDiscount / updateDiscount. Those methods are out
 * of scope for the list rebuild and still target undocumented paths.
 */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let discountType = 'flat'
  if (discount.type === 'PERCENTAGE') discountType = 'percentage'
  if (discount.type === 'FREE_SHIPPING') discountType = 'free_shipping'

  const currency = discount.currency ?? 'INR'

  // discount.value for FIXED_AMOUNT is stored as minor-unit integer;
  // Dukaan expects a major-unit decimal. PERCENTAGE values are already 0–100 scalars.
  let discountValue: number | undefined = discount.value
  if (discount.type === 'FIXED_AMOUNT' && discount.value != null) {
    discountValue = minorToMajor(discount.value, currency)
  }

  // minimumPurchaseAmount.amount is minor-unit integer; Dukaan expects major-unit decimal.
  const minOrderRaw = discount.minimumPurchaseAmount
  const minOrderValue =
    minOrderRaw?.amount != null
      ? minorToMajor(minOrderRaw.amount, minOrderRaw.currency ?? currency)
      : undefined

  return {
    code: discount.code,
    title: discount.title,
    discount_type: discountType,
    discount_value: discountValue,
    minimum_order_value: minOrderValue,
    usage_limit: discount.usageLimit,
    starts_at: discount.startsAt,
    expires_at: discount.endsAt,
  }
}
