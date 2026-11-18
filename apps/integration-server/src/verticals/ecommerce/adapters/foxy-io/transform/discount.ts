/**
 * Foxy.io Coupon (+ CouponCode) → canonical Discount.
 *
 * Foxy uses coupons rather than price rules. A coupon has a
 * `coupon_discount_type` and `coupon_discount_details` string that encodes
 * the tier/amount logic. We surface the type and first-tier value.
 *
 * coupon_discount_type values:
 *   price_percentage  → PERCENTAGE off order total
 *   price_amount      → FIXED_AMOUNT off order total
 *   quantity_percentage → PERCENTAGE off item quantity
 *   quantity_amount    → FIXED_AMOUNT off item quantity
 *   free_shipping      → FREE_SHIPPING
 *   externally_controlled → platform-specific (omit)
 *
 * coupon_discount_details format: "qty-value|qty-value|..." (tiered)
 *   e.g. "2-.50|10-3|50-5" means: buy 2 get $0.50 off, 10 get $3, etc.
 *
 * We read the first tier's value only; full tiers are available in metadata.
 *
 * Coupon codes are a separate resource (fx:coupon_codes) fetched by the
 * adapter and passed in as the optional `code` parameter.
 *
 * Docs: https://api.foxycart.com/rels/coupon
 */

import type {
  Discount,
  DiscountType,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFoxyCoupon {
  id: number | string
  name?: string | null
  /**
   * e.g. "price_percentage", "price_amount", "quantity_percentage",
   * "quantity_amount", "free_shipping", "externally_controlled"
   */
  coupon_discount_type?: string | null
  /** Tiered details string, e.g. "1-10" (1 item, 10% off) */
  coupon_discount_details?: string | null
  start_date?: string | null
  end_date?: string | null
  number_of_uses_allowed?: number | null
  number_of_uses_to_date?: number | null
  number_of_uses_allowed_per_customer?: number | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

export interface RawFoxyCouponCode {
  id?: number | string
  code?: string | null
  number_of_uses_to_date?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(discountType: string | null | undefined): DiscountType | undefined {
  if (!discountType) return undefined
  const t = discountType.toLowerCase()
  if (t === 'free_shipping') return 'FREE_SHIPPING'
  if (t === 'price_percentage' || t === 'quantity_percentage') return 'PERCENTAGE'
  if (t === 'price_amount' || t === 'quantity_amount') return 'FIXED_AMOUNT'
  return undefined
}

/**
 * Extract the first tier's value from coupon_discount_details.
 * Format: "qty-value|qty-value|..."  e.g. "1-10.5"
 * Returns the numeric value (major units for money types, percent for pct types).
 */
function parseFirstTierValue(details: string | null | undefined): number | undefined {
  if (!details) return undefined
  // Take the first tier (before any |)
  const firstTier = details.split('|')[0]
  if (!firstTier) return undefined
  // Split on dash — value is the second part
  const parts = firstTier.split('-')
  if (parts.length < 2) return undefined
  const rawValue = parseFloat(parts[1]!)
  return Number.isFinite(rawValue) ? rawValue : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(
  coupon: RawFoxyCoupon,
  code?: RawFoxyCouponCode,
): Discount {
  const type = mapType(coupon.coupon_discount_type)
  const rawValue = parseFirstTierValue(coupon.coupon_discount_details)

  // FIXED_AMOUNT values come in as major-unit decimals (e.g. 5.00 = $5.00)
  // → convert to integer minor units. PERCENTAGE stays as-is (0–100).
  const value =
    rawValue == null
      ? undefined
      : type === 'FIXED_AMOUNT'
        ? majorToMinor(rawValue, 'USD')
        : rawValue

  return {
    id: String(coupon.id),
    code: code?.code ?? undefined,
    title: coupon.name ?? undefined,
    type,
    value,
    appliesTo: 'ORDER',
    usageLimit: coupon.number_of_uses_allowed ?? undefined,
    usageCount: coupon.number_of_uses_to_date ?? code?.number_of_uses_to_date,
    startsAt: coupon.start_date ?? undefined,
    endsAt: coupon.end_date ?? undefined,
    createdAt: coupon.date_created ?? undefined,
    metadata: { coupon, code } as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  // Map canonical type back to Foxy coupon_discount_type.
  let couponDiscountType: string | undefined
  if (discount.type === 'PERCENTAGE') couponDiscountType = 'price_percentage'
  else if (discount.type === 'FIXED_AMOUNT') couponDiscountType = 'price_amount'
  else if (discount.type === 'FREE_SHIPPING') couponDiscountType = 'free_shipping'

  // Build a simple single-tier details string: "1-{value}".
  // FIXED_AMOUNT values are stored as integer minor units (e.g. 500 = $5.00);
  // Foxy expects major-unit decimals in the details string (e.g. "1-5.00").
  // PERCENTAGE values are stored as-is (0–100) and need no conversion.
  let detailsValue: number | undefined
  if (discount.value != null && couponDiscountType && couponDiscountType !== 'free_shipping') {
    detailsValue =
      discount.type === 'FIXED_AMOUNT'
        ? minorToMajor(discount.value, discount.currency ?? 'USD')
        : discount.value
  }
  const details = detailsValue != null ? `1-${detailsValue}` : undefined

  return {
    name: discount.title,
    coupon_discount_type: couponDiscountType,
    coupon_discount_details: details,
    number_of_uses_allowed: discount.usageLimit,
    start_date: discount.startsAt,
    end_date: discount.endsAt,
  }
}
