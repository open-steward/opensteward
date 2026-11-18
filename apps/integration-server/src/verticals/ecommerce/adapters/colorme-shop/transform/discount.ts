/**
 * ColorMe Shop ShopCoupon → canonical Discount.
 *
 * Docs: OpenAPI spec paths["/v1/shop_coupons"]. One flat object —
 * `coupon_type` (amount|rate|delivery_charge), `discount_amount` (money for
 * amount/delivery_charge, a bare percent for rate — same field either way,
 * confirmed in the spec), `status` (available|unavailable).
 */

import type { Discount, DiscountType } from '../../../schema/discount'

const CURRENCY = 'JPY'

export interface RawColormeCoupon {
  id: number
  name?: string
  code: string
  coupon_type: 'amount' | 'rate' | 'delivery_charge'
  discount_amount: number
  minimum_amount?: number
  starts_at?: number
  ends_at?: number
  total_usage_limit?: number
  created_at?: number
  updated_at?: number
}

const TYPE_MAP: Record<RawColormeCoupon['coupon_type'], DiscountType> = {
  amount: 'FIXED_AMOUNT',
  rate: 'PERCENTAGE',
  delivery_charge: 'FREE_SHIPPING',
}

function unixToIso(seconds: number | undefined): string | undefined {
  return seconds != null ? new Date(seconds * 1000).toISOString() : undefined
}

export function transformDiscount(raw: RawColormeCoupon): Discount {
  const type = TYPE_MAP[raw.coupon_type]
  const isMoney = raw.coupon_type === 'amount' || raw.coupon_type === 'delivery_charge'
  return {
    id: String(raw.id),
    code: raw.code,
    title: raw.name,
    type,
    value: raw.discount_amount,
    currency: isMoney ? CURRENCY : undefined,
    minimumPurchaseAmount:
      raw.minimum_amount != null && raw.minimum_amount > 0
        ? { amount: raw.minimum_amount, currency: CURRENCY }
        : undefined,
    usageLimit: raw.total_usage_limit ?? undefined,
    startsAt: unixToIso(raw.starts_at),
    endsAt: unixToIso(raw.ends_at),
    createdAt: unixToIso(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

const TYPE_TO_RAW: Record<DiscountType, RawColormeCoupon['coupon_type'] | undefined> = {
  FIXED_AMOUNT: 'amount',
  PERCENTAGE: 'rate',
  FREE_SHIPPING: 'delivery_charge',
  BUY_X_GET_Y: undefined,
}

/**
 * ColorMe's create/update body requires the FULL coupon shape (`name`,
 * `code`, `coupon_type`, `discount_amount`, `starts_at`, `ends_at`,
 * `total_usage_limit`, `usage_limit`, `group_limit_type`, `status`) —
 * defaults below are the platform's own documented defaults, not guesses.
 */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const couponType = discount.type ? TYPE_TO_RAW[discount.type] : undefined
  if (discount.type && !couponType) {
    throw new Error(`ColorMe shop_coupons has no equivalent of discount type "${discount.type}".`)
  }
  return {
    name: discount.title,
    code: discount.code,
    coupon_type: couponType,
    discount_amount: discount.value,
    minimum_amount: discount.minimumPurchaseAmount?.amount,
    starts_at: discount.startsAt,
    ends_at: discount.endsAt,
    total_usage_limit: discount.usageLimit,
  }
}
