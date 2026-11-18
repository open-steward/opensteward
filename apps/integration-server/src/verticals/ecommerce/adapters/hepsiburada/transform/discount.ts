/**
 * WooCommerce Coupon → canonical Discount.
 *
 * WC coupons are first-class resources under `/coupons`. Key mapping:
 *  - `discount_type`: `percent` → PERCENTAGE, `fixed_cart`/`fixed_product` →
 *    FIXED_AMOUNT, `free_shipping: true` boolean → FREE_SHIPPING.
 *  - `amount`: string — parse to number.
 *  - `product_ids`, `product_categories`: array of numeric ids → stringified.
 *  - `date_expires`: → `endsAt`.
 *  - `minimum_amount`: string → `minimumPurchaseAmount` (money).
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawWooCommerceCoupon {
  id: number | string
  code?: string
  amount?: string | number
  discount_type?: string
  description?: string
  date_created?: string
  date_created_gmt?: string
  date_expires?: string | null
  date_expires_gmt?: string | null
  usage_count?: number
  individual_use?: boolean
  product_ids?: Array<number | string>
  excluded_product_ids?: Array<number | string>
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  limit_usage_to_x_items?: number | null
  free_shipping?: boolean
  product_categories?: Array<number | string>
  excluded_product_categories?: Array<number | string>
  exclude_sale_items?: boolean
  minimum_amount?: string | number
  maximum_amount?: string | number
  email_restrictions?: string[]
  used_by?: string[]
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawWooCommerceCoupon): DiscountType | undefined {
  if (raw.free_shipping === true) return 'FREE_SHIPPING'
  switch (raw.discount_type) {
    case 'percent':
      return 'PERCENTAGE'
    case 'fixed_cart':
    case 'fixed_product':
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawWooCommerceCoupon): DiscountAppliesTo | undefined {
  if (raw.free_shipping === true) return 'SHIPPING'
  if (raw.discount_type === 'fixed_cart') return 'ORDER'
  if (raw.discount_type === 'fixed_product' || raw.discount_type === 'percent') {
    return raw.product_ids && raw.product_ids.length > 0 ? 'PRODUCTS' : 'ORDER'
  }
  return undefined
}

export function transformDiscount(raw: RawWooCommerceCoupon): Discount {
  const type = mapType(raw)
  const rawValue = toNum(raw.amount)
  // FIXED_AMOUNT values are money amounts → minor units; percentages stay as-is.
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, 'USD') : rawValue
  const minimum = raw.minimum_amount != null ? toNum(raw.minimum_amount) : undefined
  return {
    id: String(raw.id),
    code: raw.code,
    title: raw.code,
    type,
    value,
    appliesTo: mapAppliesTo(raw),
    productIds: raw.product_ids?.map((p) => String(p)),
    collectionIds: raw.product_categories?.map((c) => String(c)),
    minimumPurchaseAmount:
      minimum != null && minimum > 0
        ? { amount: majorToMinor(minimum, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count,
    endsAt: raw.date_expires_gmt ?? raw.date_expires ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let discount_type: string | undefined
  let free_shipping: boolean | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      discount_type = 'percent'
      break
    case 'FIXED_AMOUNT':
      discount_type = discount.appliesTo === 'ORDER' ? 'fixed_cart' : 'fixed_product'
      break
    case 'FREE_SHIPPING':
      free_shipping = true
      break
    default:
      break
  }

  // FIXED_AMOUNT values are minor units → convert back to decimal major for WC;
  // percentages stay as-is.
  const amount =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? (discount.value / 100).toString()
      : discount.value?.toString()

  return {
    code: discount.code,
    description: discount.title,
    discount_type,
    amount,
    free_shipping,
    product_ids: discount.productIds,
    product_categories: discount.collectionIds,
    usage_limit: discount.usageLimit,
    minimum_amount:
      discount.minimumPurchaseAmount?.amount != null
        ? (discount.minimumPurchaseAmount.amount / 100).toString()
        : undefined,
    date_expires: discount.endsAt,
  }
}
