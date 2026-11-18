/**
 * Payhip Coupon → canonical Discount.
 *
 * Payhip coupons have two mutually exclusive value fields:
 *  - `percent_off` — percentage discount (0-100)
 *  - `amount_off`  — fixed-amount discount, already in cents (minor units)
 *
 * `coupon_type` determines scope:
 *  - "single"     — applies to one specific product (`product_key`)
 *  - "multi"      — applies to all products in the store
 *  - "collection" — applies to all products in a specific collection
 *
 * Docs: https://payhip.com/api-reference
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'

// ── Raw Payhip shape ─────────────────────────────────────────────────────────

export interface RawPayhipCoupon {
  id: number | string
  /** Redeemable code that buyers enter at checkout. */
  code?: string | null
  /** "single" | "multi" | "collection" */
  coupon_type?: string | null
  /** Percentage off (0–100). Present when the coupon is percentage-based. */
  percent_off?: number | null
  /** Fixed amount off in cents (minor units). Present when fixed-amount. */
  amount_off?: number | null
  /** Product link/key for "single" type coupons. */
  product_key?: string | null
  /** Collection id for "collection" type coupons. */
  collection_id?: number | string | null
  /** ISO date string (YYYY-MM-DD or ISO-8601). */
  start_date?: string | null
  /** ISO date string (YYYY-MM-DD or ISO-8601). */
  end_date?: string | null
  /** Minimum purchase amount in cents required to redeem the coupon. */
  minimum_purchase_amount?: number | null
  /** Maximum number of redemptions. null = unlimited. */
  usage_limit?: number | null
  notes?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(raw: RawPayhipCoupon): DiscountType | undefined {
  if (raw.percent_off != null && raw.percent_off !== 0) return 'PERCENTAGE'
  if (raw.amount_off != null && raw.amount_off !== 0) return 'FIXED_AMOUNT'
  // Fallback: infer from whichever field is present
  if ('percent_off' in raw) return 'PERCENTAGE'
  if ('amount_off' in raw) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawPayhipCoupon): DiscountAppliesTo | undefined {
  switch (raw.coupon_type) {
    case 'multi':
      return 'ORDER'
    case 'single':
      return 'PRODUCTS'
    case 'collection':
      return 'PRODUCTS'
    default:
      return undefined
  }
}

function mapValue(raw: RawPayhipCoupon): number | undefined {
  const type = mapType(raw)
  if (type === 'PERCENTAGE') return raw.percent_off ?? undefined
  if (type === 'FIXED_AMOUNT') {
    // amount_off is already in cents (minor units) per Payhip docs
    const v = raw.amount_off
    if (v == null) return undefined
    return v
  }
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawPayhipCoupon): Discount {
  const value = mapValue(raw)
  const minAmt = raw.minimum_purchase_amount
  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.notes ?? raw.code ?? undefined,
    type: mapType(raw),
    value,
    appliesTo: mapAppliesTo(raw),
    // "single" type → the product_key identifies the scoped product
    productIds:
      raw.coupon_type === 'single' && raw.product_key
        ? [String(raw.product_key)]
        : undefined,
    // "collection" type → the collection_id identifies the scoped collection
    collectionIds:
      raw.coupon_type === 'collection' && raw.collection_id != null
        ? [String(raw.collection_id)]
        : undefined,
    minimumPurchaseAmount:
      minAmt != null && minAmt > 0
        ? { amount: minAmt, currency: 'USD' }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: toIsoDatetime(raw.end_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Payhip coupon create body. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: discount.code,
    notes: discount.title,
    start_date: discount.startsAt,
    end_date: discount.endsAt,
    usage_limit: discount.usageLimit,
  }

  // Minimum purchase amount is already in minor units (cents)
  if (discount.minimumPurchaseAmount != null) {
    body.minimum_purchase_amount = discount.minimumPurchaseAmount.amount
  }

  // Discount type → value fields
  if (discount.type === 'PERCENTAGE') {
    body.percent_off = discount.value
  } else if (discount.type === 'FIXED_AMOUNT') {
    // Payhip expects amount_off in cents
    body.amount_off = discount.value
  }

  // Coupon scope
  if (discount.productIds && discount.productIds.length > 0) {
    body.coupon_type = 'single'
    body.product_key = discount.productIds[0]
  } else if (discount.collectionIds && discount.collectionIds.length > 0) {
    body.coupon_type = 'collection'
    body.collection_id = discount.collectionIds[0]
  } else {
    body.coupon_type = 'multi'
  }

  return body
}
