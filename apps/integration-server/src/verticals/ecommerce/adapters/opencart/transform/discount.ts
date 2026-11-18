/**
 * OpenCart Coupon → canonical Discount.
 *
 * OpenCart coupons are managed in the admin under Marketing → Coupons.
 * Key mapping:
 *  - `coupon_id` → `id` (stringified)
 *  - `type`: `P` → PERCENTAGE, `F` → FIXED_AMOUNT
 *  - `discount` → `value` (number)
 *  - `free_shipping` → FREE_SHIPPING
 *  - `date_start` / `date_end` → timing
 *  - `uses_total` → usage limit
 *  - `uses_customer` → per-customer limit (in metadata)
 *  - `product` → array of product ids
 *  - `category` → array of category ids
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawOpenCartCoupon {
  coupon_id: number | string
  name?: string
  code?: string
  type?: string // 'P' for percentage, 'F' for fixed
  discount?: string | number
  logged?: number | string // 0 or 1 — customer must be logged in
  free_shipping?: number | string // 0 or 1
  total?: string | number // minimum order total
  date_start?: string
  date_end?: string
  uses_total?: number | string
  uses_customer?: number | string
  status?: number | string
  product?: Array<number | string>
  category?: Array<number | string>
  date_added?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawOpenCartCoupon): DiscountType | undefined {
  if (Number(raw.free_shipping) === 1) return 'FREE_SHIPPING'
  switch (raw.type) {
    case 'P':
      return 'PERCENTAGE'
    case 'F':
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawOpenCartCoupon): DiscountAppliesTo | undefined {
  if (Number(raw.free_shipping) === 1) return 'SHIPPING'
  if (raw.product && raw.product.length > 0) return 'PRODUCTS'
  return 'ORDER'
}

export function transformDiscount(raw: RawOpenCartCoupon): Discount {
  const value = toNum(raw.discount)
  const minimum = raw.total != null ? toNum(raw.total) : undefined
  return {
    id: String(raw.coupon_id),
    code: raw.code,
    title: raw.name ?? raw.code,
    type: mapType(raw),
    value,
    appliesTo: mapAppliesTo(raw),
    productIds: raw.product?.map((p) => String(p)),
    collectionIds: raw.category?.map((c) => String(c)),
    minimumPurchaseAmount:
      minimum != null && minimum > 0
        ? { amount: majorToMinor(minimum, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.uses_total != null ? Number(raw.uses_total) : undefined,
    endsAt: raw.date_end ?? undefined,
    createdAt: toIsoDatetime(raw.date_added),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  let free_shipping: number | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      type = 'P'
      break
    case 'FIXED_AMOUNT':
      type = 'F'
      break
    case 'FREE_SHIPPING':
      free_shipping = 1
      break
    default:
      break
  }

  return {
    name: discount.title,
    code: discount.code,
    type,
    discount: discount.value,
    free_shipping,
    product: discount.productIds,
    category: discount.collectionIds,
    uses_total: discount.usageLimit,
    total: discount.minimumPurchaseAmount?.amount,
    date_end: discount.endsAt,
  }
}
