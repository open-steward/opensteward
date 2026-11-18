/**
 * Recharge Discount → canonical Discount.
 *
 * Recharge discounts are first-class resources under `/discounts`. Key mapping:
 *  - `value_type`: `"percentage"` → PERCENTAGE, `"fixed_amount"` → FIXED_AMOUNT.
 *  - `value`: the raw discount value (percentage 0-100, or decimal major-unit
 *    amount for fixed_amount).
 *  - `applies_to_resource`: `"all"` or `"shopify_product"` etc.
 *  - `starts_at` / `ends_at`: ISO timestamps.
 *
 * Docs: https://developer.rechargepayments.com/2021-11/discounts
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeDiscount {
  id: number | string
  code?: string | null
  value?: number | string | null
  value_type?: string | null // "percentage" | "fixed_amount"
  applies_to_resource?: string | null
  applies_to_product_type?: string | null
  status?: string | null
  usage_limit?: number | null
  usage_count?: number | null
  starts_at?: string | null
  ends_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  minimum_order_amount?: string | number | null
  channel_settings?: Record<string, unknown> | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawRechargeDiscount): DiscountType | undefined {
  switch (raw.value_type?.toLowerCase()) {
    case 'percentage':
      return 'PERCENTAGE'
    case 'fixed_amount':
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

export function transformDiscount(raw: RawRechargeDiscount): Discount {
  const type = mapType(raw)
  const rawValue = toNum(raw.value)
  // FIXED_AMOUNT values are decimal major units → convert to minor units.
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, 'USD') : rawValue

  const minimum = raw.minimum_order_amount != null ? toNum(raw.minimum_order_amount) : undefined

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.code ?? undefined,
    type,
    value,
    minimumPurchaseAmount:
      minimum != null && minimum > 0
        ? { amount: majorToMinor(minimum, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count ?? undefined,
    startsAt: toIsoDatetime(raw.starts_at),
    endsAt: toIsoDatetime(raw.ends_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let value_type: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      value_type = 'percentage'
      break
    case 'FIXED_AMOUNT':
      value_type = 'fixed_amount'
      break
    default:
      break
  }

  // FIXED_AMOUNT values are minor units → convert back to decimal major for Recharge.
  const value =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? discount.value / 100
      : discount.value

  return {
    code: discount.code,
    value_type,
    value,
    usage_limit: discount.usageLimit,
    starts_at: discount.startsAt,
    ends_at: discount.endsAt,
    minimum_order_amount:
      discount.minimumPurchaseAmount?.amount != null
        ? (discount.minimumPurchaseAmount.amount / 100).toString()
        : undefined,
  }
}
