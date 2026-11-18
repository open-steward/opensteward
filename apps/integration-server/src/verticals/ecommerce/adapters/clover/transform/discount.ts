/**
 * Clover Discount → canonical Discount.
 *
 * Clover discounts can be percentage-based or fixed-amount.
 * `percentage` is present for percentage discounts; `amount` (integer cents)
 * is present for fixed-amount discounts.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { cloverCentsToMinor } from './product'

export interface RawCloverDiscount {
  id: string
  name?: string
  percentage?: number // e.g. 10 for 10%
  amount?: number // integer cents (negative)
  modifiedTime?: number
  [key: string]: unknown
}

function mapType(raw: RawCloverDiscount): DiscountType | undefined {
  if (raw.percentage != null) return 'PERCENTAGE'
  if (raw.amount != null) return 'FIXED_AMOUNT'
  return undefined
}

function mapValue(raw: RawCloverDiscount): number | undefined {
  if (raw.percentage != null) return raw.percentage
  if (raw.amount != null) return cloverCentsToMinor(Math.abs(raw.amount))
  return undefined
}

export function transformDiscount(raw: RawCloverDiscount): Discount {
  return {
    id: raw.id,
    title: raw.name ?? undefined,
    type: mapType(raw),
    value: mapValue(raw),
    currency: raw.amount != null ? 'USD' : undefined,
    appliesTo: 'ORDER',
    customerEligibility: 'ALL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Clover discount body for create/update. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: discount.title,
  }
  if (discount.type === 'PERCENTAGE' && discount.value != null) {
    body['percentage'] = discount.value
  } else if (discount.value != null) {
    body['amount'] = -Math.round(discount.value)
  }
  return body
}
