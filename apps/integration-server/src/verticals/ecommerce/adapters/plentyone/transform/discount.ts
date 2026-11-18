/**
 * PlentyONE Coupon / Campaign → canonical Discount.
 *
 * PlentyONE manages discount codes as "coupons" under the coupon/campaign API.
 * A campaign defines the discount rules (type, value, minimum purchase, date
 * range, usage limits) and individual coupon codes are generated under it.
 *
 * Endpoints used:
 *   GET /rest/coupons/campaigns
 *   GET /rest/coupons/campaigns/{campaignId}
 *   POST /rest/coupons/campaigns
 *   PUT /rest/coupons/campaigns/{campaignId}
 *   DELETE /rest/coupons/campaigns/{campaignId}
 *   GET /rest/coupons/codes?campaignId={campaignId}
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneCouponCampaign {
  id: number | string
  name?: string | null
  /**
   * couponType: 1 = percentage, 2 = fixed amount, 3 = free shipping,
   * 4 = purchase value (fixed deduction from total)
   */
  couponType?: number | null
  /** Discount value. For percentage: 0–100. For fixed: major-unit amount. */
  discount?: number | null
  /** Minimum purchase amount in major units (EUR). */
  minOrderValue?: number | null
  /** ISO 8601 start date */
  validFrom?: string | null
  /** ISO 8601 end date */
  validTo?: string | null
  usageLimit?: number | null
  usageCount?: number | null
  currency?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface RawPlentyOneCouponCode {
  id?: number | string
  campaignId?: number | string
  code?: string | null
  usageCount?: number | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(couponType: number | null | undefined): DiscountType | undefined {
  if (couponType == null) return undefined
  if (couponType === 1) return 'PERCENTAGE'
  if (couponType === 2 || couponType === 4) return 'FIXED_AMOUNT'
  if (couponType === 3) return 'FREE_SHIPPING'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCampaign(
  raw: RawPlentyOneCouponCampaign,
  code?: RawPlentyOneCouponCode,
): Discount {
  const type = mapType(raw.couponType)
  const currency = raw.currency ?? 'EUR'
  // For percentage discounts the raw value is already the percentage (0–100).
  // For fixed discounts the raw value is major-unit money → convert to minor.
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(raw.discount ?? 0, currency)
      : (raw.discount ?? 0)

  return {
    id: String(raw.id),
    code: code?.code ?? undefined,
    title: raw.name ?? undefined,
    type,
    value,
    minimumPurchaseAmount:
      raw.minOrderValue != null && raw.minOrderValue > 0
        ? { amount: majorToMinor(raw.minOrderValue, currency), currency }
        : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? code?.usageCount ?? undefined,
    startsAt: toIsoDatetime(raw.validFrom) ?? undefined,
    endsAt: toIsoDatetime(raw.validTo) ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: { campaign: raw, code } as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → PlentyONE coupon campaign body for create/update. */
export function untransformCampaign(discount: Partial<Discount>): Record<string, unknown> {
  let couponType: number | undefined
  if (discount.type === 'PERCENTAGE') couponType = 1
  else if (discount.type === 'FIXED_AMOUNT') couponType = 2
  else if (discount.type === 'FREE_SHIPPING') couponType = 3

  const discountCurrency =
    discount.minimumPurchaseAmount?.currency ?? discount.currency ?? 'EUR'
  const discountVal =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, discountCurrency)
      : discount.value

  return {
    name: discount.title,
    couponType,
    discount: discountVal,
    minOrderValue: discount.minimumPurchaseAmount
      ? minorToMajor(
          discount.minimumPurchaseAmount.amount,
          discount.minimumPurchaseAmount.currency,
        )
      : undefined,
    validFrom: discount.startsAt,
    validTo: discount.endsAt,
    usageLimit: discount.usageLimit,
    currency: discount.minimumPurchaseAmount?.currency,
  }
}
