/**
 * Loyverse Discount → canonical Discount.
 *
 * Loyverse discounts have:
 *  - `id`: unique identifier
 *  - `type`: "PERCENT" | "AMOUNT" (fixed-amount)
 *  - `name`: display name (used as `code` since Loyverse discounts are
 *    applied by name at the POS rather than via a customer-entered coupon code)
 *  - `discount_amount`: fixed amount in major units (when type=AMOUNT)
 *  - `discount_percent`: percentage value 0–100 (when type=PERCENT)
 *  - `stores[]`: store IDs where the discount is active (null/empty = all stores)
 *  - `created_at`, `updated_at`, `deleted_at`
 *
 * Loyverse does not support customer-entered promo codes; discounts are staff-
 * applied. `appliesTo` defaults to ORDER since Loyverse applies discounts at
 * the receipt level.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawLoyverseDiscount {
  id: string
  type?: string | null
  name?: string | null
  /** Fixed discount value in major currency units (when type=AMOUNT). */
  discount_amount?: number | null
  /** Percentage value 0–100 (when type=PERCENT). */
  discount_percent?: number | null
  stores?: string[] | null
  restricted_access?: boolean
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

function mapDiscountType(type: string | null | undefined): DiscountType | undefined {
  if (!type) return undefined
  const upper = type.toUpperCase()
  if (upper === 'PERCENT' || upper === 'PERCENTAGE') return 'PERCENTAGE'
  if (upper === 'AMOUNT' || upper === 'FIXED_AMOUNT') return 'FIXED_AMOUNT'
  return undefined
}

export function transformDiscount(raw: RawLoyverseDiscount): Discount {
  const canonicalType = mapDiscountType(raw.type)

  let value: number | undefined
  if (canonicalType === 'PERCENTAGE') {
    value = raw.discount_percent ?? undefined
  } else if (canonicalType === 'FIXED_AMOUNT') {
    // Store as minor units per canonical Money convention
    value =
      raw.discount_amount != null
        ? majorToMinor(raw.discount_amount, 'USD')
        : undefined
  }

  return {
    id: raw.id,
    title: raw.name ?? undefined,
    // Loyverse discounts are staff-applied by name at the POS, not coupon-code-entered
    code: raw.name ?? undefined,
    type: canonicalType,
    value,
    appliesTo: 'ORDER',
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Loyverse discount body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: discount.title ?? discount.code,
  }

  if (discount.type === 'PERCENTAGE') {
    body.type = 'PERCENT'
    body.discount_percent = discount.value
  } else if (discount.type === 'FIXED_AMOUNT') {
    body.type = 'AMOUNT'
    // Convert minor units back to major units for Loyverse
    body.discount_amount =
      discount.value != null ? discount.value / 100 : undefined
  }

  return body
}
