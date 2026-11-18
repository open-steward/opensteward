/**
 * Cafe24 Coupon → canonical Discount.
 *
 * Cafe24 uses "coupons" for its discount/promotion concept:
 *   GET /api/v2/admin/coupons
 *   GET /api/v2/admin/coupons/{coupon_no}
 *
 * Key field conventions:
 *   - `coupon_no`         → unique coupon identifier
 *   - `coupon_name`       → human-readable title
 *   - `coupon_code`       → redeemable code
 *   - `discount_method`   → 'Y' = percentage, 'W' = fixed won amount, 'F' = free shipping
 *   - `discount_value`    → numeric discount magnitude
 *   - `benefit_price`     → calculated benefit price (for fixed discounts)
 *   - `start_date`        → ISO-8601 start
 *   - `end_date`          → ISO-8601 end
 *   - `available_count`   → usage limit
 *   - `issued_count`      → usage count so far
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#coupons
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import type { Iso4217CurrencyT } from '@opensteward/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24Coupon {
  coupon_no: number | string
  coupon_name?: string | null
  coupon_code?: string | null
  discount_method?: string | null
  discount_value?: string | number | null
  benefit_price?: string | number | null
  start_date?: string | null
  end_date?: string | null
  available_count?: number | null
  issued_count?: number | null
  available_period?: string | null
  currency?: string | null
  created_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * Map Cafe24 discount_method to canonical DiscountType.
 *   'Y' → PERCENTAGE (percentage off)
 *   'W' → FIXED_AMOUNT (fixed won/currency amount off)
 *   'F' → FREE_SHIPPING
 */
function mapDiscountType(method: string | null | undefined): DiscountType | undefined {
  if (!method) return undefined
  switch (method.toUpperCase()) {
    case 'Y': return 'PERCENTAGE'
    case 'W': return 'FIXED_AMOUNT'
    case 'F': return 'FREE_SHIPPING'
    default: return undefined
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCoupon(raw: RawCafe24Coupon, currency: string = 'KRW'): Discount {
  const couponCurrency = raw.currency ?? currency
  const type = mapDiscountType(raw.discount_method)
  const rawValue = toNum(raw.discount_value)

  // For FIXED_AMOUNT discounts, convert to minor units.
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(rawValue, couponCurrency)
      : rawValue

  return {
    id: String(raw.coupon_no),
    code: raw.coupon_code ?? undefined,
    title: raw.coupon_name ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? (couponCurrency as Iso4217CurrencyT) : undefined,
    appliesTo: 'ORDER',
    usageLimit: raw.available_count ?? undefined,
    usageCount: raw.issued_count ?? undefined,
    customerEligibility: 'ALL',
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: toIsoDatetime(raw.end_date),
    createdAt: toIsoDatetime(raw.created_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Cafe24 coupon body (for create/update). */
export function untransformCoupon(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body.coupon_name = discount.title
  if (discount.code != null) body.coupon_code = discount.code
  if (discount.type != null) {
    switch (discount.type) {
      case 'PERCENTAGE': body.discount_method = 'Y'; break
      case 'FIXED_AMOUNT': body.discount_method = 'W'; break
      case 'FREE_SHIPPING': body.discount_method = 'F'; break
    }
  }
  if (discount.value != null) body.discount_value = discount.value
  if (discount.usageLimit != null) body.available_count = discount.usageLimit
  if (discount.startsAt != null) body.start_date = discount.startsAt
  if (discount.endsAt != null) body.end_date = discount.endsAt
  return body
}
