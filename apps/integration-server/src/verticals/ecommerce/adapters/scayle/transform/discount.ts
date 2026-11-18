/**
 * SCAYLE Promotion → canonical Discount.
 *
 * SCAYLE models discount programs as "promotions". Each Promotion has:
 *  - id (string UUID), name (string), type (e.g. "percentage_discount"),
 *    value / valueType, conditions (minimum purchase amount, customer eligibility),
 *    startDate / endDate, active (bool)
 *
 * Promo codes (vouchers) are a separate SCAYLE resource but are surfaced here
 * as the canonical `code` field when available.
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScaylePromotionCondition {
  minimumBasketAmount?: number | null
  currency?: string | null
}

export interface RawScaylePromotion {
  id: string | number
  name?: string | null
  type?: string | null
  /** Discount value. For percentage types this is 0-100; for fixed types it is in minor units. */
  value?: number | null
  currency?: string | null
  conditions?: RawScaylePromotionCondition | null
  startDate?: string | null
  endDate?: string | null
  active?: boolean
  usageLimit?: number | null
  usageCount?: number | null
  code?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(type: string | null | undefined): DiscountType | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  if (t.includes('percentage') || t === 'percent') return 'PERCENTAGE'
  if (t.includes('fixed') || t.includes('amount')) return 'FIXED_AMOUNT'
  if (t.includes('shipping')) return 'FREE_SHIPPING'
  if (t.includes('buy_x') || t.includes('bxgy')) return 'BUY_X_GET_Y'
  return undefined
}

function mapAppliesTo(type: string | null | undefined): DiscountAppliesTo | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  if (t.includes('shipping')) return 'SHIPPING'
  if (t.includes('product') || t.includes('item')) return 'PRODUCTS'
  return 'ORDER'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawScaylePromotion): Discount {
  const currency = raw.currency ?? raw.conditions?.currency ?? 'EUR'
  const type = mapType(raw.type)

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.name ?? undefined,
    type,
    value: raw.value ?? undefined,
    currency,
    appliesTo: mapAppliesTo(raw.type),
    minimumPurchaseAmount:
      raw.conditions?.minimumBasketAmount != null
        ? {
            amount: raw.conditions.minimumBasketAmount,
            currency: raw.conditions.currency ?? currency,
          }
        : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? undefined,
    startsAt: raw.startDate ?? undefined,
    endsAt: raw.endDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → SCAYLE promotion body (for create). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    PERCENTAGE: 'percentage_discount',
    FIXED_AMOUNT: 'fixed_amount_discount',
    FREE_SHIPPING: 'free_shipping',
    BUY_X_GET_Y: 'buy_x_get_y',
  }
  return {
    name: discount.title,
    type: discount.type ? typeMap[discount.type] ?? discount.type.toLowerCase() : undefined,
    value: discount.value,
    currency: discount.currency,
    startDate: discount.startsAt,
    endDate: discount.endsAt,
    usageLimit: discount.usageLimit,
    conditions:
      discount.minimumPurchaseAmount != null
        ? {
            minimumBasketAmount: discount.minimumPurchaseAmount.amount,
            currency: discount.minimumPurchaseAmount.currency,
          }
        : undefined,
  }
}
