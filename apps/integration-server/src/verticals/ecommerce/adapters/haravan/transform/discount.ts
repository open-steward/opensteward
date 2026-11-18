/**
 * Haravan DiscountCode → canonical Discount.
 *
 * Unlike Shopify's PriceRule + DiscountCode split, Haravan's `discounts.json`
 * resource is one flat object per code: `discount_type`
 * (fixed_amount|percentage|shipping), `value`, `status` (enabled|disabled,
 * toggled via the `/enable.json` and `/disable.json` endpoints — there is no
 * general-purpose update endpoint).
 *
 * Only `listDiscounts`/`getDiscount` are implemented (see index.ts /
 * metadata.ts): the doc page states `com.write_discounts` is
 * "Only used by the private app", so this adapter's public Connect OAuth app
 * cannot request it and create/enable/disable/delete are not implemented.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/discount/discount-codes/
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawHaravanDiscount {
  id: number | string
  code: string
  applies_once?: boolean
  minimum_order_amount?: number
  usage_limit?: number
  discount_type: 'fixed_amount' | 'percentage' | 'shipping'
  value: number
  status?: 'enabled' | 'disabled'
  times_used?: number
  starts_at?: string | null
  ends_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const TYPE_MAP: Record<RawHaravanDiscount['discount_type'], DiscountType> = {
  fixed_amount: 'FIXED_AMOUNT',
  percentage: 'PERCENTAGE',
  shipping: 'FREE_SHIPPING',
}

/**
 * `raw.value` is money only for `fixed_amount` (and the shipping-fee cap for
 * `shipping`) — for `percentage` it is already a percent, never a money
 * amount, so it is never run through a currency conversion. When it IS money,
 * `currency` must come from the shop (see `shopCurrency` in index.ts) — never
 * a hard-coded default.
 */
export function transformDiscount(raw: RawHaravanDiscount, currency: string): Discount {
  const type = TYPE_MAP[raw.discount_type]
  const isMoney = raw.discount_type === 'fixed_amount' || raw.discount_type === 'shipping'
  return {
    id: String(raw.id),
    code: raw.code,
    type,
    value: raw.value,
    currency: isMoney ? currency : undefined,
    minimumPurchaseAmount:
      raw.minimum_order_amount != null && raw.minimum_order_amount > 0
        ? { amount: raw.minimum_order_amount, currency }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.times_used ?? undefined,
    startsAt: raw.starts_at ?? undefined,
    endsAt: raw.ends_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
