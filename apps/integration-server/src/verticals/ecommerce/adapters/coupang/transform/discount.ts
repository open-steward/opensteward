/**
 * Coupang instant-discount coupon → canonical Discount.
 *
 * GET /v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupons lists coupons
 * by status as `data.content[]`
 * (https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-a-list-of-coupons-status),
 * and GET .../vendors/{vendorId}/coupon?couponId= reads one as `data.content`
 * (https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-one-coupon-couponid).
 * Every field read below is in those response tables.
 *
 * Left out on purpose:
 *   - startAt/endAt ("ex) 2017-08-04 01:00:00") carry no offset and the docs
 *     name no time zone, so they cannot be placed on the timeline; they stay
 *     in `metadata`.
 *   - `value` for FIXED_WITH_QUANTITY and PRICE: `discount` is documented only
 *     as "Discount rate", and the response names no currency.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawCoupangCoupon {
  /** "Contract ID" */
  contractId?: number
  /** "Vendor's contract code (Coupang management code)" */
  vendorContractId?: number | null
  /** "Coupon ID" */
  couponId?: number
  /** "Discount rate" */
  discount?: number
  /** "Effective end date/time ex) 2017-09-01 00:00:00" */
  endAt?: string
  /** "Max. discount amount ex) 1000, 10000" */
  maxDiscountPrice?: number
  /** "Promotion name" */
  promotionName?: string | null
  /** "Effective start date/time ex) 2017-08-04 01:00:00" */
  startAt?: string
  /** STANDBY, APPLIED, PAUSED, EXPIRED, DETACHED */
  status?: string
  /** "RATE (fixed-rate discount), FIXED_WITH_QUANTITY (fixed-amount discount per quantity) and PRICE (fixed-amount discount)" */
  type?: string
  /** "Issuance target: false (all: Default), true (Rocket Wow members)" */
  wowExclusive?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function mapCouponType(type: string | undefined): DiscountType | undefined {
  switch (type) {
    case undefined:
      return undefined
    case 'RATE':
      return 'PERCENTAGE'
    case 'FIXED_WITH_QUANTITY':
    case 'PRICE':
      return 'FIXED_AMOUNT'
    default:
      return 'unknown'
  }
}

function mapEligibility(wowExclusive: string | undefined): Discount['customerEligibility'] {
  if (wowExclusive === 'true') return 'SPECIFIC'
  if (wowExclusive === 'false') return 'ALL'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawCoupangCoupon): Discount {
  if (raw.couponId == null) throw new Error('Coupang coupon has no couponId')
  const type = mapCouponType(raw.type)
  return {
    id: String(raw.couponId),
    title: raw.promotionName || undefined,
    type,
    value: type === 'PERCENTAGE' ? raw.discount : undefined,
    customerEligibility: mapEligibility(raw.wowExclusive),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
