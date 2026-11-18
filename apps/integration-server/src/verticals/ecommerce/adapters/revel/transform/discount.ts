/**
 * Revel Discount → canonical Discount.
 *
 * Revel discounts come from `/resources/Discount/`. They can be
 * percentage-based or fixed-amount.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawRevelDiscount {
  id: number
  name?: string
  value?: number // percentage or fixed amount
  type?: number // 0=percentage, 1=fixed amount
  active?: boolean
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

function mapType(raw: RawRevelDiscount): DiscountType | undefined {
  if (raw.type === 0) return 'PERCENTAGE'
  if (raw.type === 1) return 'FIXED_AMOUNT'
  return undefined
}

function mapValue(raw: RawRevelDiscount): number | undefined {
  return raw.value ?? undefined
}

export function transformDiscount(raw: RawRevelDiscount): Discount {
  return {
    id: String(raw.id),
    title: raw.name ?? undefined,
    type: mapType(raw),
    value: mapValue(raw),
    currency: raw.type === 1 ? 'USD' : undefined,
    appliesTo: 'ORDER',
    customerEligibility: 'ALL',
    createdAt: raw.created_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Revel discount body for create/update. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body['name'] = discount.title
  if (discount.type === 'PERCENTAGE') {
    body['type'] = 0
    if (discount.value != null) body['value'] = discount.value
  } else if (discount.type === 'FIXED_AMOUNT') {
    body['type'] = 1
    if (discount.value != null) body['value'] = discount.value
  } else if (discount.value != null) {
    body['value'] = discount.value
  }
  return body
}
