/**
 * Wix Coupon (Coupons API, `/stores/v2/coupons`) → canonical Discount.
 *
 * Fields are those of the `Coupon` schema in Query Coupons / Get A Coupon:
 *   https://dev.wix.com/docs/api-reference/business-solutions/coupons/coupons/query-coupons.md
 *   https://dev.wix.com/docs/api-reference/business-solutions/coupons/coupons/get-a-coupon.md
 *
 * Everything but `id`, `dateCreated`, `expired`, `numberOfUsages`,
 * `displayData` and `appId` lives under `specification`. The coupon carries
 * no currency, so money-valued fields (`moneyOffAmount`, `minimumSubtotal`)
 * cannot become canonical Money: `minimumPurchaseAmount` and `currency` are
 * left out, and the raw coupon stays in `metadata`.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'

export interface RawWixCouponSpecification {
  /** ONE-OF with minimumSubtotal. */
  scope?: {
    namespace?: string
    group?: { name?: string; entityId?: string }
  }
  minimumSubtotal?: number
  /** ONE-OF: exactly one of these defines the coupon type. */
  moneyOffAmount?: number
  percentOffRate?: number
  freeShipping?: boolean
  fixedPriceAmount?: number
  buyXGetY?: { x?: number; y?: number }
  name?: string
  code?: string
  /** "Coupon valid from this date and time, in milliseconds." */
  startTime?: string
  /** "Coupon expires at this date and time, in milliseconds." */
  expirationTime?: string
  usageLimit?: number
  limitPerCustomer?: number
  limitedToOneItem?: boolean
  appliesToSubscriptions?: boolean
  active?: boolean
  type?: string
  tags?: string[]
}

export interface RawWixCoupon {
  id?: string
  specification?: RawWixCouponSpecification
  /** "Time the coupon was created (UNIX Epoch time in milliseconds)." */
  dateCreated?: string
  expired?: boolean
  numberOfUsages?: number
  [key: string]: unknown
}

/**
 * The type is whichever ONE-OF member is set. `fixedPriceAmount` ("Fixed sale
 * price") sets a price rather than taking an amount off, so it has no
 * canonical type and maps to 'unknown'.
 */
function mapType(spec: RawWixCouponSpecification): DiscountType | undefined {
  if (spec.percentOffRate != null) return 'PERCENTAGE'
  if (spec.moneyOffAmount != null) return 'FIXED_AMOUNT'
  if (spec.freeShipping === true) return 'FREE_SHIPPING'
  if (spec.buyXGetY != null) return 'BUY_X_GET_Y'
  if (spec.fixedPriceAmount != null) return 'unknown'
  return undefined
}

/**
 * Only a percentage has a value that reads without a currency. The canonical
 * FIXED_AMOUNT value is a "money amount in `currency`" (minor units, as the
 * reference adapter emits it), and a Wix coupon has no currency, so
 * `moneyOffAmount` ("Discount as a fixed amount.") stays in `metadata` only.
 */
function mapValue(spec: RawWixCouponSpecification): number | undefined {
  if (spec.percentOffRate != null) return spec.percentOffRate
  return undefined
}

/**
 * Scope per "Valid scope values": a `product` or `collection` group limits
 * the coupon to that entity; `minimumSubtotal` (the other ONE-OF member)
 * applies to the cart; free shipping applies to shipping.
 */
function mapAppliesTo(spec: RawWixCouponSpecification): DiscountAppliesTo | undefined {
  if (spec.freeShipping === true) return 'SHIPPING'
  const group = spec.scope?.group?.name
  if (group === 'product' || group === 'collection') return 'PRODUCTS'
  if (spec.minimumSubtotal != null) return 'ORDER'
  return undefined
}

function entityIds(spec: RawWixCouponSpecification, group: string): string[] | undefined {
  const g = spec.scope?.group
  return g?.name === group && g.entityId ? [g.entityId] : undefined
}

export function transformDiscount(raw: RawWixCoupon): Discount {
  if (!raw.id) throw new Error('Wix coupon has no id')
  const spec = raw.specification ?? {}
  return {
    id: raw.id,
    code: spec.code || undefined,
    title: spec.name || undefined,
    type: mapType(spec),
    value: mapValue(spec),
    appliesTo: mapAppliesTo(spec),
    productIds: entityIds(spec, 'product'),
    collectionIds: entityIds(spec, 'collection'),
    usageLimit: spec.usageLimit,
    usageCount: raw.numberOfUsages,
    startsAt: toIsoDatetime(spec.startTime),
    endsAt: toIsoDatetime(spec.expirationTime),
    createdAt: toIsoDatetime(raw.dateCreated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Wix coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: discount.title,
    code: discount.code,
    startTime: discount.startsAt,
    expirationTime: discount.endsAt,
    limitPerCustomer: discount.usageLimit,
  }

  if (discount.type === 'PERCENTAGE' && discount.value != null) {
    body.percentOffRate = discount.value
  } else if (discount.type === 'FIXED_AMOUNT' && discount.value != null) {
    body.moneyOffAmount = discount.value
  } else if (discount.type === 'FREE_SHIPPING') {
    body.freeShipping = true
  }

  if (discount.minimumPurchaseAmount) {
    body.minimumSubtotal = discount.minimumPurchaseAmount.amount
  }

  return body
}
