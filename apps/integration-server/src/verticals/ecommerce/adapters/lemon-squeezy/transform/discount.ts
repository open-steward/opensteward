/**
 * Lemon Squeezy Discount → canonical Discount.
 *
 * LS discount amount_type values:
 *   "percent"     → PERCENTAGE  (value = 0-100)
 *   "fixed"       → FIXED_AMOUNT (value = cents, integer)
 *
 * Docs: https://docs.lemonsqueezy.com/api/discounts/the-discount-object
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import type { LsResource } from '../client'

// ── Raw Lemon Squeezy attribute shape ─────────────────────────────────────────

export interface RawLsDiscountAttributes {
  store_id: number
  name: string
  code: string
  amount: number              // percent 0-100 OR cents (integer)
  amount_type: string         // "percent" | "fixed"
  is_limited_to_products: boolean
  is_limited_redemptions: boolean
  max_redemptions: number
  starts_at?: string | null
  expires_at?: string | null
  duration: string            // "once" | "repeating" | "forever"
  duration_in_months: number
  status: string              // "draft" | "published"
  status_formatted?: string
  created_at: string
  updated_at: string
  test_mode?: boolean
  [key: string]: unknown
}

export type RawLsDiscount = LsResource<RawLsDiscountAttributes>

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(amountType: string): DiscountType | undefined {
  if (amountType === 'percent') return 'PERCENTAGE'
  if (amountType === 'fixed') return 'FIXED_AMOUNT'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawLsDiscount): Discount {
  const attrs = raw.attributes
  const type = mapType(attrs.amount_type)
  return {
    id: raw.id,
    code: attrs.code || undefined,
    title: attrs.name || undefined,
    type,
    // For FIXED_AMOUNT, LS stores cents (already minor units); for PERCENTAGE, keep as-is
    value: attrs.amount,
    appliesTo: attrs.is_limited_to_products ? 'PRODUCTS' : 'ORDER',
    usageLimit:
      attrs.is_limited_redemptions && attrs.max_redemptions > 0
        ? attrs.max_redemptions
        : undefined,
    startsAt: attrs.starts_at ?? undefined,
    endsAt: attrs.expires_at ?? undefined,
    createdAt: attrs.created_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    name: discount.title,
    code: discount.code,
    amount: discount.value,
    amount_type: discount.type === 'PERCENTAGE' ? 'percent' : 'fixed',
    is_limited_to_products: discount.appliesTo === 'PRODUCTS',
    is_limited_redemptions: discount.usageLimit != null && discount.usageLimit > 0,
    max_redemptions: discount.usageLimit ?? 0,
    starts_at: discount.startsAt ?? null,
    expires_at: discount.endsAt ?? null,
  }
}
