/**
 * Epos Now Discount -> canonical Discount.
 *
 * Epos Now discounts can be percentage-based or fixed-amount, applied
 * to products or entire transactions.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawEposNowDiscount {
  Id?: number
  Name?: string
  DiscountType?: number // 0 = percentage, 1 = fixed amount
  Value?: number
  Active?: boolean
  CreatedDate?: string
  [key: string]: unknown
}

function mapType(raw: RawEposNowDiscount): DiscountType | undefined {
  if (raw.DiscountType === 0) return 'PERCENTAGE'
  if (raw.DiscountType === 1) return 'FIXED_AMOUNT'
  return undefined
}

export function transformDiscount(raw: RawEposNowDiscount): Discount {
  const type = mapType(raw)
  return {
    id: String(raw.Id ?? ''),
    title: raw.Name ?? undefined,
    type,
    value: raw.Value ?? undefined,
    currency: type === 'FIXED_AMOUNT' ? 'GBP' : undefined,
    appliesTo: 'ORDER',
    customerEligibility: 'ALL',
    createdAt: raw.CreatedDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount -> Epos Now discount body for create/update. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body['Name'] = discount.title
  if (discount.type === 'PERCENTAGE') {
    body['DiscountType'] = 0
  } else if (discount.type === 'FIXED_AMOUNT') {
    body['DiscountType'] = 1
  }
  if (discount.value != null) body['Value'] = discount.value
  return body
}
