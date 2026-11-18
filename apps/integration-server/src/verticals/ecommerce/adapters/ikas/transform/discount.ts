/**
 * ikas Campaign / Coupon → canonical Discount.
 *
 * ikas exposes discounts under the "Campaigns" resource. Discounts include
 * coupon codes (with usage limits, percentage or fixed amount, applies-to
 * scope) and automatic discounts.
 *
 * Key fields:
 *   id, title (internal name), couponCode, discountType (PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING),
 *   discountValue, minimumOrderAmount, usageLimit, usageCount,
 *   startsAt, endsAt, isActive, appliesTo (ALL | SPECIFIC_PRODUCTS | SPECIFIC_CATEGORIES)
 *
 * Docs: https://ikas.dev/docs/api/admin-api/campaigns
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasCampaign {
  id: string
  title?: string | null
  couponCode?: string | null
  /** PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING */
  discountType?: string | null
  discountValue?: number | null
  minimumOrderAmount?: number | null
  usageLimit?: number | null
  usageCount?: number | null
  /** ALL | SPECIFIC_PRODUCTS | SPECIFIC_CATEGORIES */
  appliesTo?: string | null
  productIds?: string[] | null
  categoryIds?: string[] | null
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean | null
  createdAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(raw: string | null | undefined): DiscountType | undefined {
  if (!raw) return undefined
  const up = raw.toUpperCase()
  if (up === 'PERCENTAGE') return 'PERCENTAGE'
  if (up === 'FIXED_AMOUNT') return 'FIXED_AMOUNT'
  if (up === 'FREE_SHIPPING') return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(raw: string | null | undefined): DiscountAppliesTo | undefined {
  if (!raw) return undefined
  const up = raw.toUpperCase()
  if (up === 'ALL') return 'ORDER'
  if (up === 'SPECIFIC_PRODUCTS') return 'PRODUCTS'
  // SPECIFIC_CATEGORIES has no canonical equivalent in DiscountAppliesToSchema
  // (which only allows ORDER | PRODUCTS | SHIPPING | unknown).
  if (up === 'SPECIFIC_CATEGORIES') return 'unknown'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawIkasCampaign): Discount {
  const type = mapType(raw.discountType)
  // ikas discountValue is a plain number (e.g. 10 for 10% or 10.00 TRY).
  // For FIXED_AMOUNT, convert to minor units; for others keep as-is.
  const value =
    raw.discountValue != null
      ? type === 'FIXED_AMOUNT'
        ? majorToMinor(raw.discountValue, 'TRY')
        : raw.discountValue
      : 0

  return {
    id: raw.id,
    code: raw.couponCode ?? undefined,
    title: raw.title ?? undefined,
    type,
    value,
    appliesTo: mapAppliesTo(raw.appliesTo),
    productIds: raw.productIds && raw.productIds.length > 0 ? raw.productIds : undefined,
    collectionIds: raw.categoryIds && raw.categoryIds.length > 0 ? raw.categoryIds : undefined,
    minimumPurchaseAmount:
      raw.minimumOrderAmount != null && raw.minimumOrderAmount > 0
        ? { amount: majorToMinor(raw.minimumOrderAmount, 'TRY'), currency: 'TRY' }
        : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? undefined,
    customerEligibility: 'ALL',
    startsAt: raw.startsAt ?? undefined,
    endsAt: raw.endsAt ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → ikas campaign input. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    title: discount.title,
    couponCode: discount.code,
    discountType:
      discount.type === 'PERCENTAGE'
        ? 'PERCENTAGE'
        : discount.type === 'FREE_SHIPPING'
          ? 'FREE_SHIPPING'
          : 'FIXED_AMOUNT',
    discountValue: discount.value,
    usageLimit: discount.usageLimit,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    productIds: discount.productIds,
    categoryIds: discount.collectionIds,
    appliesTo:
      discount.appliesTo === 'PRODUCTS'
        ? 'SPECIFIC_PRODUCTS'
        : discount.appliesTo === 'SHIPPING'
          ? 'ALL'
          : 'ALL',
  }
}
