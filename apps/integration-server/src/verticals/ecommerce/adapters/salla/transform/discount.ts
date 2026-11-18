/**
 * Salla Coupon → canonical Discount.
 *
 * Salla coupon fields:
 *  - id, code, type (percentage|fixed), status
 *  - amount: { amount, currency }
 *  - minimum_amount: { amount, currency }
 *  - maximum_amount: { amount, currency }
 *  - free_shipping (boolean)
 *  - usage_limit, usage_limit_per_user
 *  - start_date, expiry_date
 *  - is_apply_with_offer (boolean)
 *
 * Salla also has "Special Offers" (/specialoffers) which are rule-based
 * discounts applied automatically (no code). We map those similarly.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaAmountObj {
  amount: number
  currency: string
}

export interface RawSallaCoupon {
  id: number | string
  code?: string | null
  type?: string | null
  status?: string | null
  amount?: RawSallaAmountObj
  minimum_amount?: RawSallaAmountObj
  maximum_amount?: RawSallaAmountObj
  free_shipping?: boolean
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  usage_count?: number | null
  is_apply_with_offer?: boolean
  start_date?: string | null
  expiry_date?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(type: string | null | undefined, free_shipping?: boolean): DiscountType | undefined {
  if (free_shipping) return 'FREE_SHIPPING'
  if (!type) return undefined
  const lower = type.toLowerCase()
  if (lower === 'percentage' || lower === 'p') return 'PERCENTAGE'
  if (lower === 'fixed' || lower === 'f') return 'FIXED_AMOUNT'
  return undefined
}

function mapMoney(obj: RawSallaAmountObj | null | undefined): { amount: number; currency: string } | undefined {
  if (!obj) return undefined
  return {
    amount: majorToMinor(obj.amount, obj.currency),
    currency: obj.currency,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawSallaCoupon): Discount {
  const type = mapType(raw.type, raw.free_shipping)
  const currency = raw.amount?.currency ?? 'SAR'

  // For PERCENTAGE discounts, value is the raw percent (e.g. 10 for 10%).
  // For FIXED_AMOUNT, value is minor units of money.
  let value: number | undefined
  if (raw.amount) {
    if (type === 'PERCENTAGE') {
      value = raw.amount.amount // already a percentage
    } else {
      value = majorToMinor(raw.amount.amount, currency)
    }
  }

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    type,
    value,
    currency: raw.amount?.currency ?? undefined,
    minimumPurchaseAmount: mapMoney(raw.minimum_amount),
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count ?? undefined,
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: toIsoDatetime(raw.expiry_date),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Salla coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  if (discount.type === 'PERCENTAGE') type = 'percentage'
  else if (discount.type === 'FIXED_AMOUNT') type = 'fixed'

  // PERCENTAGE: value is raw percent (e.g. 10 for 10%) — send as-is.
  // FIXED_AMOUNT: value is in minor units; convert back to major for Salla.
  const amount =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, discount.currency)
      : discount.value

  return {
    code: discount.code,
    type,
    amount,
    free_shipping: discount.type === 'FREE_SHIPPING' ? true : undefined,
    minimum_amount: discount.minimumPurchaseAmount
      ? minorToMajor(discount.minimumPurchaseAmount.amount, discount.minimumPurchaseAmount.currency)
      : undefined,
    usage_limit: discount.usageLimit,
    start_date: discount.startsAt,
    expiry_date: discount.endsAt,
  }
}
