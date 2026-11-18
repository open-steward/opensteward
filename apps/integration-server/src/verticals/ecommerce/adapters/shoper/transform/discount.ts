/**
 * Shoper PromotionCode → canonical Discount.
 *
 * Shoper tracks discount/promo codes under:
 *   GET /webapi/rest/promotion-codes[/{id}]
 *
 * Each promo code has a value (percentage or fixed amount), usage limits,
 * and optional date constraints.
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperPromotionCode {
  promotion_id?: number | string
  code?: string | null
  /** Discount value. For percentage: 0-100. For amount: decimal money value. */
  value?: string | number | null
  /** 'percent' | 'amount' */
  value_type?: string | null
  /** Minimum order value to activate code (decimal). */
  min_value?: string | number | null
  currency?: string | null
  usage_limit?: number | null
  usage_count?: number | null
  /** 1 = active, 0 = inactive */
  active?: number | null
  date_from?: string | null
  date_to?: string | null
  add_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(valueType: string | null | undefined): DiscountType | undefined {
  if (!valueType) return undefined
  if (valueType.toLowerCase() === 'percent') return 'PERCENTAGE'
  if (valueType.toLowerCase() === 'amount') return 'FIXED_AMOUNT'
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawShoperPromotionCode): Discount {
  const type = mapType(raw.value_type)
  const currency = raw.currency ?? 'PLN'
  const rawValue = toNum(raw.value)
  // FIXED_AMOUNT values are major-unit money → convert to minor units
  const value =
    type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, currency) : rawValue

  const minValue = toNum(raw.min_value)

  return {
    id: String(raw.promotion_id ?? ''),
    code: raw.code ?? undefined,
    title: raw.code ?? undefined,
    type,
    value: value > 0 ? value : undefined,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: 'ORDER' as DiscountAppliesTo,
    productIds: undefined,
    collectionIds: undefined,
    minimumPurchaseAmount:
      minValue > 0
        ? { amount: majorToMinor(minValue, currency), currency }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count ?? undefined,
    customerEligibility: 'ALL',
    startsAt: raw.date_from ?? undefined,
    endsAt: raw.date_to ?? undefined,
    createdAt: raw.add_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Shoper promo code body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    code: discount.code,
    // canonical discount.value is minor units for FIXED_AMOUNT; Shoper expects major-unit decimal
    value:
      discount.type === 'FIXED_AMOUNT'
        ? minorToMajor(discount.value as number | undefined, discount.currency)
        : discount.value,
    value_type: discount.type === 'PERCENTAGE' ? 'percent' : 'amount',
    // minimumPurchaseAmount.amount is minor units; Shoper expects major-unit decimal
    min_value: minorToMajor(
      discount.minimumPurchaseAmount?.amount,
      discount.minimumPurchaseAmount?.currency,
    ),
    usage_limit: discount.usageLimit,
    date_from: discount.startsAt,
    date_to: discount.endsAt,
    active: 1,
  }
}
