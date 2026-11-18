/**
 * Ecwid Discount Coupon → canonical Discount.
 *
 * Ecwid coupons live under `/discount_coupons`. Key mapping:
 *  - `discountType`: `PERCENT` → PERCENTAGE, `ABS` → FIXED_AMOUNT,
 *    `SHIPPING` → FREE_SHIPPING.
 *  - `discount`: numeric value.
 *  - `productIds`: array of product IDs the coupon applies to.
 *  - `catalogLimit.categories`: category IDs.
 *  - `expirationDate`: ISO date string → `endsAt`.
 *  - `orderCount` / `usesLimit`: usage metrics.
 *
 * Docs: https://developer.ecwid.com/
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'

export interface RawEcwidCoupon {
  id?: number | string
  name?: string
  code?: string
  discountType?: string
  discount?: number
  status?: string
  launchDate?: string
  expirationDate?: string | null
  totalLimit?: number | null
  usesLimit?: string | null
  repeatCustomerOnly?: boolean
  creationDate?: string
  updateDate?: string
  orderCount?: number
  catalogLimit?: {
    products?: Array<number | string>
    categories?: Array<number | string>
  }
  [key: string]: unknown
}

function mapType(raw: RawEcwidCoupon): DiscountType | undefined {
  switch (raw.discountType) {
    case 'PERCENT':
      return 'PERCENTAGE'
    case 'ABS':
      return 'FIXED_AMOUNT'
    case 'SHIPPING':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawEcwidCoupon): DiscountAppliesTo | undefined {
  if (raw.discountType === 'SHIPPING') return 'SHIPPING'
  const productIds = raw.catalogLimit?.products
  if (productIds && productIds.length > 0) return 'PRODUCTS'
  return 'ORDER'
}

export function transformDiscount(raw: RawEcwidCoupon): Discount {
  return {
    id: String(raw.id ?? raw.code ?? ''),
    code: raw.code,
    title: raw.name ?? raw.code,
    type: mapType(raw),
    value: raw.discount,
    appliesTo: mapAppliesTo(raw),
    productIds: raw.catalogLimit?.products?.map((p) => String(p)),
    collectionIds: raw.catalogLimit?.categories?.map((c) => String(c)),
    usageLimit: raw.totalLimit ?? undefined,
    usageCount: raw.orderCount,
    endsAt: raw.expirationDate ?? undefined,
    createdAt: raw.creationDate,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let discountType: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      discountType = 'PERCENT'
      break
    case 'FIXED_AMOUNT':
      discountType = 'ABS'
      break
    case 'FREE_SHIPPING':
      discountType = 'SHIPPING'
      break
    default:
      break
  }

  const catalogLimit: Record<string, unknown> = {}
  if (discount.productIds) {
    catalogLimit['products'] = discount.productIds.map(Number)
  }
  if (discount.collectionIds) {
    catalogLimit['categories'] = discount.collectionIds.map(Number)
  }

  return {
    name: discount.title,
    code: discount.code,
    discountType,
    discount: discount.value,
    totalLimit: discount.usageLimit,
    expirationDate: discount.endsAt,
    catalogLimit: Object.keys(catalogLimit).length > 0 ? catalogLimit : undefined,
  }
}
