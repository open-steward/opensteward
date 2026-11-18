/**
 * Webflow Discount → canonical Discount.
 *
 * Webflow does not have a dedicated discounts API in v2 as of 2025.
 * Discounts are applied at the storefront level. This transform handles
 * the shape returned when discount codes are present on orders.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawWebflowDiscount {
  _id?: string
  code?: string
  type?: string
  value?: number
  currency?: string
  startsAt?: string
  endsAt?: string
  createdOn?: string
  [key: string]: unknown
}

function mapType(type: string | undefined): DiscountType | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  if (t === 'percentage' || t === 'percent') return 'PERCENTAGE'
  if (t === 'fixed' || t === 'fixed_amount') return 'FIXED_AMOUNT'
  if (t === 'free_shipping' || t === 'shipping') return 'FREE_SHIPPING'
  return undefined
}

export function transformDiscount(raw: RawWebflowDiscount): Discount {
  return {
    id: raw._id ?? raw.code ?? '',
    code: raw.code,
    type: mapType(raw.type),
    value: raw.value,
    currency: raw.currency,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    createdAt: raw.createdOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    code: discount.code,
    type: discount.type?.toLowerCase(),
    value: discount.value,
  }
}
