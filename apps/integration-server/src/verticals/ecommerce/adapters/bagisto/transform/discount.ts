/**
 * Bagisto CartRule / CatalogRule → canonical Discount.
 *
 * Bagisto exposes promotions via the `/api/v1/cart-rules` endpoint (and
 * separately catalog rules). Cart rules have coupon codes, discount amounts
 * or percentages, and date constraints.
 *
 * Docs: https://devdocs.bagisto.com/1.x/api/cart-rules.html
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface BagistoCartRule {
  id: number | string
  name?: string | null
  description?: string | null
  coupon_type?: number | null // 1 = no coupon, 2 = auto, 3 = specific code
  use_coupon?: boolean | null
  coupon_code?: string | null
  discount_type?: string | null // by_percent | by_fixed | cart_fixed | buy_x_get_y
  discount_amount?: string | number | null
  usage_per_coupon?: number | null
  usage_per_customer?: number | null
  times_used?: number | null
  starts_from?: string | null
  ends_till?: string | null
  status?: boolean | number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapDiscountType(raw: BagistoCartRule): DiscountType | undefined {
  const t = (raw.discount_type ?? '').toLowerCase()
  if (t === 'by_percent') return 'PERCENTAGE'
  if (t === 'by_fixed' || t === 'cart_fixed') return 'FIXED_AMOUNT'
  if (t === 'buy_x_get_y') return 'BUY_X_GET_Y'
  return undefined
}

function mapValue(raw: BagistoCartRule): number | undefined {
  const v = raw.discount_amount
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isFinite(n) ? n : undefined
}

export function transformDiscount(raw: BagistoCartRule): Discount {
  return {
    id: String(raw.id),
    code: raw.coupon_code ?? undefined,
    title: raw.name ?? undefined,
    type: mapDiscountType(raw),
    value: mapValue(raw),
    appliesTo: 'ORDER',
    usageLimit: raw.usage_per_coupon ?? undefined,
    usageCount: raw.times_used ?? undefined,
    customerEligibility: 'ALL',
    startsAt: raw.starts_from ?? undefined,
    endsAt: raw.ends_till ?? undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(data: Partial<Discount>): Record<string, unknown> {
  const discountType =
    data.type === 'PERCENTAGE'
      ? 'by_percent'
      : data.type === 'FIXED_AMOUNT'
        ? 'by_fixed'
        : data.type === 'BUY_X_GET_Y'
          ? 'buy_x_get_y'
          : undefined
  return {
    name: data.title,
    coupon_code: data.code,
    discount_type: discountType,
    discount_amount: data.value,
    starts_from: data.startsAt,
    ends_till: data.endsAt,
    usage_per_coupon: data.usageLimit,
    status: true,
  }
}
