/**
 * Lightspeed Retail Discount → canonical Discount.
 *
 * Lightspeed R-Series has a Discount resource with percentage and flat
 * discount types.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { lsDecimalToNumber } from './product'
import { majorToMinor } from '../../../schema/shared'

export interface RawLightspeedDiscount {
  discountID: string
  name?: string
  discountAmount?: string
  discountPercent?: string
  requireCustomer?: string
  archived?: string
  createTime?: string
  timeStamp?: string
  [key: string]: unknown
}

function mapDiscountType(raw: RawLightspeedDiscount): DiscountType | undefined {
  const pct = lsDecimalToNumber(raw.discountPercent)
  const amt = lsDecimalToNumber(raw.discountAmount)
  if (pct > 0) return 'PERCENTAGE'
  if (amt > 0) return 'FIXED_AMOUNT'
  return undefined
}

function mapValue(raw: RawLightspeedDiscount): number | undefined {
  const pct = lsDecimalToNumber(raw.discountPercent)
  if (pct > 0) return pct
  const amt = lsDecimalToNumber(raw.discountAmount)
  if (amt > 0) return majorToMinor(amt, 'USD')
  return undefined
}

export function transformDiscount(raw: RawLightspeedDiscount): Discount {
  const type = mapDiscountType(raw)
  return {
    id: raw.discountID,
    title: raw.name ?? undefined,
    type,
    value: mapValue(raw),
    currency: type === 'FIXED_AMOUNT' ? 'USD' : undefined,
    appliesTo: 'ORDER',
    customerEligibility: raw.requireCustomer === 'true' ? 'SPECIFIC' : 'ALL',
    createdAt: raw.createTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Lightspeed Discount body for create/update. */
export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const isPercentage = discount.type === 'PERCENTAGE'
  const body: Record<string, unknown> = {
    name: discount.title,
  }
  if (isPercentage) {
    body['discountPercent'] = discount.value?.toString()
    body['discountAmount'] = '0'
  } else {
    body['discountAmount'] =
      discount.value != null ? (discount.value / 100).toString() : undefined
    body['discountPercent'] = '0'
  }
  return body
}
