/**
 * Yo!Kart Promo Code → canonical Discount.
 *
 * Yo!Kart calls discount codes "promo codes". Key field mapping:
 *  - `promocode_id`         → id
 *  - `promocode_code`       → code
 *  - `promocode_name`       → title
 *  - `promocode_type`:
 *      "1" = percentage     → PERCENTAGE
 *      "2" = fixed amount   → FIXED_AMOUNT
 *      "3" = free shipping  → FREE_SHIPPING
 *  - `promocode_value`      → value (percent or minor-unit amount)
 *  - `promocode_min_order_amount` → minimumPurchaseAmount
 *  - `promocode_usage_count`  → usageCount
 *  - `promocode_total_usage`  → usageLimit
 *  - `promocode_start_date`   → startsAt
 *  - `promocode_expiry_date`  → endsAt
 *
 * Money value fields come as decimal major units (e.g. "25.00" for $25).
 *
 * Yo!Kart promo code API paths:
 *   GET /admin/promocodes/listing       → paginated list (data.promocodes[])
 *   GET /admin/promocodes/view/{id}     → single promo code
 *   POST /admin/promocodes/add          → create
 *   POST /admin/promocodes/edit/{id}    → update
 *   POST /admin/promocodes/delete/{id}  → delete
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartPromoCode {
  promocode_id: number | string
  promocode_code?: string
  promocode_name?: string
  /**
   * Promo type:
   *  "1" → PERCENTAGE
   *  "2" → FIXED_AMOUNT
   *  "3" → FREE_SHIPPING
   */
  promocode_type?: string | number
  /** Discount value — percentage (0-100) or major-unit amount. */
  promocode_value?: string | number | null
  /** Currency for fixed-amount promos. */
  promocode_currency?: string
  /** Minimum order total (major units) before promo applies. */
  promocode_min_order_amount?: string | number | null
  promocode_usage_count?: number | string
  promocode_total_usage?: number | string | null
  promocode_start_date?: string | null
  promocode_expiry_date?: string | null
  promocode_date_added?: string
  /** "1" = active, "0" = inactive. */
  promocode_active?: string | number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawYokartPromoCode): DiscountType | undefined {
  switch (String(raw.promocode_type)) {
    case '1':
      return 'PERCENTAGE'
    case '2':
      return 'FIXED_AMOUNT'
    case '3':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawYokartPromoCode): DiscountAppliesTo | undefined {
  switch (String(raw.promocode_type)) {
    case '1':
    case '2':
      return 'ORDER'
    case '3':
      return 'SHIPPING'
    default:
      return undefined
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawYokartPromoCode): Discount {
  const type = mapType(raw)
  const currency = (raw.promocode_currency as string | undefined) ?? 'USD'
  const rawValue = toNum(raw.promocode_value)

  // FIXED_AMOUNT values are decimal major units → convert to minor units.
  // PERCENTAGE values stay as-is (0-100).
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(rawValue, currency)
      : rawValue

  const minOrder =
    raw.promocode_min_order_amount != null
      ? toNum(raw.promocode_min_order_amount)
      : undefined

  const usageCount =
    raw.promocode_usage_count != null
      ? parseInt(String(raw.promocode_usage_count), 10)
      : undefined
  const usageLimit =
    raw.promocode_total_usage != null && raw.promocode_total_usage !== ''
      ? parseInt(String(raw.promocode_total_usage), 10)
      : undefined

  return {
    id: String(raw.promocode_id),
    code: raw.promocode_code,
    title: raw.promocode_name || raw.promocode_code,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      minOrder != null && minOrder > 0
        ? { amount: majorToMinor(minOrder, currency), currency }
        : undefined,
    usageLimit: usageLimit != null && !Number.isNaN(usageLimit) ? usageLimit : undefined,
    usageCount: usageCount != null && !Number.isNaN(usageCount) ? usageCount : undefined,
    startsAt: toIsoDatetime(raw.promocode_start_date),
    endsAt: toIsoDatetime(raw.promocode_expiry_date),
    createdAt: toIsoDatetime(raw.promocode_date_added),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let typeCode: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      typeCode = '1'
      break
    case 'FIXED_AMOUNT':
      typeCode = '2'
      break
    case 'FREE_SHIPPING':
      typeCode = '3'
      break
    default:
      break
  }

  // Convert FIXED_AMOUNT minor units back to decimal major for Yo!Kart
  // using currency-aware divisor (e.g. JPY stays as-is, KWD divides by 1000).
  const fixedCurrency = discount.currency
  const rawValue =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, fixedCurrency)?.toString()
      : discount.value?.toString()

  const minPurchaseCurrency = discount.minimumPurchaseAmount?.currency
  return {
    promocode_code: discount.code,
    promocode_name: discount.title,
    promocode_type: typeCode,
    promocode_value: rawValue,
    promocode_currency: discount.currency,
    promocode_min_order_amount:
      discount.minimumPurchaseAmount?.amount != null
        ? minorToMajor(discount.minimumPurchaseAmount.amount, minPurchaseCurrency)?.toString()
        : undefined,
    promocode_total_usage: discount.usageLimit,
    promocode_start_date: discount.startsAt,
    promocode_expiry_date: discount.endsAt,
  }
}
