/**
 * Tiendanube / Nuvemshop Coupon → canonical Discount.
 *
 * Tiendanube uses "coupons" for discount codes. The resource has:
 *  - `type`: `percentage` | `absolute` | `shipping`
 *  - `value`: decimal string (percent or money amount)
 *  - `code`: redeemable code string
 *  - `max_uses`, `used`, `valid` for usage limits
 *  - `start_date`, `end_date` for validity window (date-only strings)
 *  - `min_price`: minimum purchase amount (major units)
 *  - `products` and `categories` for product/collection scoping
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/coupon
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeCouponCategory {
  id: number | string
  name?: Record<string, string> | null
  parent?: number | string | null
  [key: string]: unknown
}

export interface RawTiendanubeCouponProduct {
  id: number | string
  name?: Record<string, string> | null
  [key: string]: unknown
}

export interface RawTiendanubeCoupon {
  id: number | string
  code?: string | null
  type?: string | null
  value?: string | number | null
  valid?: boolean
  used?: number
  max_uses?: number | null
  includes_shipping?: boolean
  start_date?: string | null
  end_date?: string | null
  min_price?: number | string | null
  first_consumer_purchase?: boolean
  combines_with_other_discounts?: boolean
  categories?: RawTiendanubeCouponCategory[]
  products?: RawTiendanubeCouponProduct[]
  deleted_at?: string | null
  [key: string]: unknown
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(type: string | null | undefined): DiscountType | undefined {
  if (!type) return undefined
  switch (type.toLowerCase()) {
    case 'percentage':
      return 'PERCENTAGE'
    case 'absolute':
      return 'FIXED_AMOUNT'
    case 'shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(coupon: RawTiendanubeCoupon): DiscountAppliesTo | undefined {
  if (coupon.type === 'shipping') return 'SHIPPING'
  if (coupon.products && coupon.products.length > 0) return 'PRODUCTS'
  if (coupon.categories && coupon.categories.length > 0) return 'PRODUCTS'
  return 'ORDER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCoupon(raw: RawTiendanubeCoupon): Discount {
  const type = mapType(raw.type)
  const rawValue = toNum(raw.value)
  // For FIXED_AMOUNT, convert major-unit to minor-unit cents.
  // For PERCENTAGE / FREE_SHIPPING, value is a percentage number.
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(rawValue, 'USD') // currency not on coupon; use 0-decimal for percentage
      : rawValue

  const minPrice = toNum(raw.min_price)

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    type,
    value: value > 0 ? value : undefined,
    appliesTo: mapAppliesTo(raw),
    productIds: raw.products?.map((p) => String(p.id)),
    collectionIds: raw.categories?.map((c) => String(c.id)),
    minimumPurchaseAmount:
      minPrice > 0
        ? { amount: majorToMinor(minPrice, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.max_uses ?? undefined,
    usageCount: raw.used,
    customerEligibility: 'ALL',
    startsAt: raw.start_date ?? undefined,
    endsAt: raw.end_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Tiendanube coupon body (for create/update). */
export function untransformCoupon(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  if (discount.type === 'PERCENTAGE') type = 'percentage'
  else if (discount.type === 'FIXED_AMOUNT') type = 'absolute'
  else if (discount.type === 'FREE_SHIPPING') type = 'shipping'

  return {
    code: discount.code,
    type,
    value: discount.value != null ? String(discount.value) : undefined,
    max_uses: discount.usageLimit,
    start_date: discount.startsAt,
    end_date: discount.endsAt,
    min_price: discount.minimumPurchaseAmount?.amount != null
      ? (discount.minimumPurchaseAmount.amount / 100).toFixed(2)
      : undefined,
    products: discount.productIds?.map((id) => ({ id })),
    categories: discount.collectionIds?.map((id) => ({ id })),
  }
}
