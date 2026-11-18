/**
 * InSales DiscountCode → canonical Discount.
 *
 * InSales manages discounts via `/admin/discount_codes.json`. Each code has:
 *   id, code, type_id (1=percentage, 2=fixed, 3=free_shipping),
 *   discount (percentage value 0-100 for type 1; else 0),
 *   discount_value (fixed amount for type 2),
 *   uses_count, uses_limit, valid_till, created_at
 *
 * NOTE: Prices from InSales are decimal major-unit RUB values.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawInsalesDiscountCode {
  id: number | string
  code?: string | null
  // 1 = percentage, 2 = fixed_amount, 3 = free_shipping
  type_id?: number | null
  /** Percentage value (0-100) when type_id === 1 */
  discount?: string | number | null
  /** Fixed amount when type_id === 2 (major units) */
  discount_value?: string | number | null
  uses_count?: number | null
  uses_limit?: number | null
  valid_till?: string | null
  created_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(typeId: number | null | undefined): DiscountType | undefined {
  if (typeId == null) return undefined
  if (typeId === 1) return 'PERCENTAGE'
  if (typeId === 2) return 'FIXED_AMOUNT'
  if (typeId === 3) return 'FREE_SHIPPING'
  return undefined
}

export function transformDiscount(raw: RawInsalesDiscountCode): Discount {
  const type = mapType(raw.type_id)
  let value: number | undefined
  if (type === 'PERCENTAGE') {
    value = Math.abs(toNum(raw.discount))
  } else if (type === 'FIXED_AMOUNT') {
    value = majorToMinor(Math.abs(toNum(raw.discount_value)), 'RUB')
  } else {
    value = 0
  }

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    type,
    value,
    usageCount: raw.uses_count ?? undefined,
    usageLimit: raw.uses_limit ?? undefined,
    endsAt: raw.valid_till ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → InSales discount_code body. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let typeId: number | undefined
  let discountVal: number | undefined
  let discountValue: number | undefined

  if (discount.type === 'PERCENTAGE') {
    typeId = 1
    discountVal = discount.value ?? 0
  } else if (discount.type === 'FIXED_AMOUNT') {
    typeId = 2
    // canonical value is integer minor units; InSales expects major-unit decimal
    discountValue = minorToMajor(discount.value ?? 0, discount.currency ?? 'RUB')
  } else if (discount.type === 'FREE_SHIPPING') {
    typeId = 3
  }

  return {
    code: discount.code,
    type_id: typeId,
    discount: discountVal,
    discount_value: discountValue,
    uses_limit: discount.usageLimit,
    valid_till: discount.endsAt,
  }
}
