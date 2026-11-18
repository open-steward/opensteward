/**
 * Shopee discount → canonical Discount.
 *
 * Shopee has a dedicated discount API with create/list/update/delete.
 * Discounts apply to specific items and have start/end times.
 *
 * API: `/api/v2/discount/get_discount_list`, `/api/v2/discount/add_discount`, etc.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeDiscountItem {
  item_id?: number
  model_id?: number
  item_promotion_price?: number
  purchase_limit?: number
  item_original_price?: number
  stock?: number
  [key: string]: unknown
}

export interface RawShopeeDiscount {
  discount_id: number
  discount_name?: string
  start_time?: number
  end_time?: number
  status?: string
  item_list?: RawShopeeDiscountItem[]
  source?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine the discount type. Shopee discounts are always fixed-amount
 * price reductions on specific items.
 */
function inferDiscountType(_raw: RawShopeeDiscount): DiscountType {
  // Shopee discounts set a promotion price per item, which is effectively
  // a fixed-amount discount.
  return 'FIXED_AMOUNT'
}

/**
 * Compute the discount value as the average savings across items.
 */
function computeDiscountValue(raw: RawShopeeDiscount): {
  value: number | undefined
  currency: string | undefined
} {
  const items = raw.item_list ?? []
  if (items.length === 0) return { value: undefined, currency: undefined }

  let totalSavings = 0
  let count = 0
  for (const item of items) {
    if (item.item_original_price != null && item.item_promotion_price != null) {
      totalSavings += item.item_original_price - item.item_promotion_price
      count++
    }
  }

  return {
    value: count > 0 ? totalSavings / count : undefined,
    currency: undefined, // Shopee doesn't include currency in discount response
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawShopeeDiscount): Discount {
  const { value, currency } = computeDiscountValue(raw)
  const productIds = (raw.item_list ?? [])
    .filter((i) => i.item_id != null)
    .map((i) => String(i.item_id))

  return {
    id: String(raw.discount_id),
    title: raw.discount_name,
    type: inferDiscountType(raw),
    value,
    currency,
    appliesTo: productIds.length > 0 ? 'PRODUCTS' : undefined,
    productIds: productIds.length > 0 ? productIds : undefined,
    usageLimit: raw.item_list?.[0]?.purchase_limit,
    startsAt: raw.start_time
      ? new Date(raw.start_time * 1000).toISOString()
      : undefined,
    endsAt: raw.end_time
      ? new Date(raw.end_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Discount → Shopee add_discount / update_discount body.
 */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title) body['discount_name'] = discount.title
  if (discount.startsAt) body['start_time'] = Math.floor(new Date(discount.startsAt).getTime() / 1000)
  if (discount.endsAt) body['end_time'] = Math.floor(new Date(discount.endsAt).getTime() / 1000)

  // Pass through extra fields
  const extra = discount.metadata?.['_shopeeExtra'] as Record<string, unknown> | undefined
  if (extra) Object.assign(body, extra)

  return body
}
