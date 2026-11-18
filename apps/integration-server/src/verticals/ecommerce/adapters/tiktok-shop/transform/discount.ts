/**
 * TikTok Shop promotion/activity → canonical Discount.
 *
 * TikTok Shop has a promotion API for creating product discounts and
 * flash sales. Activities have start/end times and apply to specific
 * products/SKUs.
 *
 * Activity types:
 *   1 = Fixed Price, 2 = Direct Discount, 3 = Flash Sale
 * Activity statuses:
 *   1 = Not Started, 2 = Ongoing, 3 = Expired, 4 = Deactivated
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokActivityProduct {
  product_id?: string
  sku_id?: string
  quantity_limit?: number
  activity_price?: string
  original_price?: string
  [key: string]: unknown
}

export interface RawTikTokActivity {
  id: string
  title?: string
  activity_type?: number
  status?: number
  begin_time?: number
  end_time?: number
  product_list?: RawTikTokActivityProduct[]
  create_time?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map TikTok Shop activity type to canonical DiscountType.
 */
export function mapDiscountType(activityType: number | undefined): DiscountType {
  switch (activityType) {
    case 1: // Fixed Price
      return 'FIXED_AMOUNT'
    case 2: // Direct Discount
      return 'PERCENTAGE'
    case 3: // Flash Sale
      return 'FIXED_AMOUNT'
    default:
      return 'FIXED_AMOUNT'
  }
}

/**
 * Compute the discount value as the average savings across products.
 */
function computeDiscountValue(raw: RawTikTokActivity): {
  value: number | undefined
  currency: string | undefined
} {
  const products = raw.product_list ?? []
  if (products.length === 0) return { value: undefined, currency: undefined }

  let totalSavings = 0
  let count = 0
  for (const product of products) {
    const original = product.original_price ? Number(product.original_price) : undefined
    const activity = product.activity_price ? Number(product.activity_price) : undefined
    if (original != null && activity != null && original > activity) {
      totalSavings += original - activity
      count++
    }
  }

  return {
    // Savings is a money amount in decimal major units → canonical minor units.
    value: count > 0 ? majorToMinor(totalSavings / count) : undefined,
    currency: undefined, // TikTok Shop doesn't include currency in activity response
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawTikTokActivity): Discount {
  const { value, currency } = computeDiscountValue(raw)
  const productIds = (raw.product_list ?? [])
    .filter((p) => p.product_id != null)
    .map((p) => String(p.product_id))

  return {
    id: raw.id,
    title: raw.title,
    type: mapDiscountType(raw.activity_type),
    value,
    currency,
    appliesTo: productIds.length > 0 ? 'PRODUCTS' : undefined,
    productIds: productIds.length > 0 ? productIds : undefined,
    usageLimit: raw.product_list?.[0]?.quantity_limit,
    startsAt: raw.begin_time
      ? new Date(raw.begin_time * 1000).toISOString()
      : undefined,
    endsAt: raw.end_time
      ? new Date(raw.end_time * 1000).toISOString()
      : undefined,
    createdAt: raw.create_time
      ? new Date(raw.create_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Discount → TikTok Shop create/update activity body.
 */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title) body['title'] = discount.title
  if (discount.startsAt) body['begin_time'] = Math.floor(new Date(discount.startsAt).getTime() / 1000)
  if (discount.endsAt) body['end_time'] = Math.floor(new Date(discount.endsAt).getTime() / 1000)

  // Map discount type to activity type
  if (discount.type === 'PERCENTAGE') {
    body['activity_type'] = 2
  } else if (discount.type === 'FIXED_AMOUNT') {
    body['activity_type'] = 1
  }

  // Pass through extra fields
  const extra = discount.metadata?.['_tiktokExtra'] as Record<string, unknown> | undefined
  if (extra) Object.assign(body, extra)

  return body
}
