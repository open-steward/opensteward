/**
 * Bagy Coupon → canonical Discount.
 *
 * Key Bagy coupon fields:
 *  - `id`, `code` — coupon identifier and redeemable code
 *  - `type` — "1" = percentage, "2" = fixed amount, "3" = free shipping
 *  - `value` — discount value (percentage or BRL amount, major-unit decimal)
 *  - `minimum_value` — minimum order value to apply (major-unit decimal)
 *  - `available` — 0|1 active flag
 *  - `date_start`, `date_end` — validity window
 *  - `uses_limit` — max usage count (null = unlimited)
 *  - `uses_customer` — per-customer usage limit
 *  - `times_used` — current usage count
 *  - `modified`, `created` — timestamps
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Bagy shape ───────────────────────────────────────────────────────────

export interface RawBagyCoupon {
  id: number | string
  code?: string | null
  type?: number | string | null      // 1=%, 2=fixed, 3=free_shipping
  value?: string | number | null
  minimum_value?: string | number | null
  available?: number | string | null
  date_start?: string | null
  date_end?: string | null
  uses_limit?: number | string | null
  uses_customer?: number | string | null
  times_used?: number | string | null
  modified?: string | null
  created?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY = 'BRL'

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(type: number | string | null | undefined): DiscountType | undefined {
  const t = Number(type)
  if (t === 1) return 'PERCENTAGE'
  if (t === 2) return 'FIXED_AMOUNT'
  if (t === 3) return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(type: number | string | null | undefined): DiscountAppliesTo | undefined {
  const t = Number(type)
  if (t === 3) return 'SHIPPING'
  if (t === 1 || t === 2) return 'ORDER'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawBagyCoupon): Discount {
  const discountType = mapType(raw.type)
  const rawValue = toNum(raw.value)

  // Fixed-amount values are major-unit BRL → convert to minor units.
  // Percentage values are kept as-is.
  const value =
    discountType === 'FIXED_AMOUNT' ? majorToMinor(rawValue, CURRENCY) : rawValue

  const minValue = toNum(raw.minimum_value)

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.code ?? undefined,
    type: discountType,
    value,
    appliesTo: mapAppliesTo(raw.type),
    minimumPurchaseAmount:
      minValue > 0
        ? { amount: majorToMinor(minValue, CURRENCY), currency: CURRENCY }
        : undefined,
    usageLimit: raw.uses_limit != null ? Number(raw.uses_limit) : undefined,
    usageCount: raw.times_used != null ? Number(raw.times_used) : undefined,
    customerEligibility: 'ALL',
    startsAt: toIsoDatetime(raw.date_start),
    endsAt: toIsoDatetime(raw.date_end),
    createdAt: toIsoDatetime(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Bagy coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: number | undefined
  if (discount.type === 'PERCENTAGE') type = 1
  else if (discount.type === 'FIXED_AMOUNT') type = 2
  else if (discount.type === 'FREE_SHIPPING') type = 3

  // Convert minor-unit fixed amounts back to major-unit decimals.
  const value =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, CURRENCY)?.toFixed(2)
      : discount.value

  const minValue =
    discount.minimumPurchaseAmount?.amount != null
      ? minorToMajor(discount.minimumPurchaseAmount.amount, discount.minimumPurchaseAmount.currency ?? CURRENCY)?.toFixed(2)
      : undefined

  return {
    code: discount.code,
    type,
    value,
    minimum_value: minValue,
    uses_limit: discount.usageLimit,
    date_start: discount.startsAt,
    date_end: discount.endsAt,
    available: 1,
  }
}
