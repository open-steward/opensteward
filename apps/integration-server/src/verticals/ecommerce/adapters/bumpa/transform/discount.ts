/**
 * Bumpa Discount (coupon/promo code) → canonical Discount.
 *
 * Bumpa coupon/discount records have a code, discount type (percentage or
 * fixed), value, optional minimum purchase amount, and usage limits.
 * Fixed-amount values are decimal major-unit strings in the store currency
 * (typically NGN) and are converted to minor units via majorToMinor().
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawBumpaDiscount {
  id: number | string
  code?: string | null
  name?: string
  title?: string
  type?: string | null
  discount_type?: string | null
  value?: string | number | null
  amount?: string | number | null
  percentage?: string | number | null
  currency?: string
  applies_to?: string | null
  minimum_purchase?: string | number | null
  minimum_amount?: string | number | null
  usage_limit?: number | null
  usage_count?: number | null
  times_used?: number | null
  customer_eligibility?: string | null
  product_ids?: Array<number | string>
  collection_ids?: Array<number | string>
  starts_at?: string | null
  ends_at?: string | null
  expires_at?: string | null
  created_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

function mapType(raw: RawBumpaDiscount): DiscountType | undefined {
  const t = raw.discount_type ?? raw.type
  if (!t) return undefined
  switch (t.toLowerCase()) {
    case 'percentage':
    case 'percent':
      return 'PERCENTAGE'
    case 'fixed':
    case 'fixed_amount':
    case 'amount':
      return 'FIXED_AMOUNT'
    case 'free_shipping':
    case 'shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(s: string | null | undefined): DiscountAppliesTo | undefined {
  if (!s) return undefined
  switch (s.toLowerCase()) {
    case 'order':
    case 'all':
      return 'ORDER'
    case 'products':
    case 'specific_products':
      return 'PRODUCTS'
    case 'shipping':
    case 'free_shipping':
      return 'SHIPPING'
    default:
      return undefined
  }
}

export function transformDiscount(raw: RawBumpaDiscount): Discount {
  const currency = (raw.currency as string | undefined) ?? 'NGN'
  const type = mapType(raw)

  // Value: percentage stays as-is (0-100); fixed amount is converted to minor units.
  let value: number | undefined
  const rawValue = raw.value ?? raw.amount ?? raw.percentage
  if (rawValue != null) {
    const n = toNum(rawValue)
    value = type === 'FIXED_AMOUNT' ? majorToMinor(n, currency) : Math.abs(n)
  }

  const minimumPurchase = raw.minimum_purchase ?? raw.minimum_amount
  const usageCount = raw.usage_count ?? raw.times_used ?? undefined

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.name ?? raw.title ?? raw.code ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: mapAppliesTo(raw.applies_to),
    productIds: raw.product_ids?.map(String),
    collectionIds: raw.collection_ids?.map(String),
    minimumPurchaseAmount:
      minimumPurchase != null && toNum(minimumPurchase) > 0
        ? {
            amount: majorToMinor(toNum(minimumPurchase), currency),
            currency,
          }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: usageCount != null ? Number(usageCount) : undefined,
    startsAt: raw.starts_at ?? undefined,
    endsAt: raw.ends_at ?? raw.expires_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Bumpa discount body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const type =
    discount.type === 'PERCENTAGE'
      ? 'percentage'
      : discount.type === 'FREE_SHIPPING'
        ? 'free_shipping'
        : 'fixed_amount'

  // For FIXED_AMOUNT discounts, canonical `value` is a minor-unit integer;
  // Bumpa expects a major-unit decimal. PERCENTAGE values are unitless (0-100)
  // and must NOT be divided.
  const value =
    discount.type === 'FIXED_AMOUNT'
      ? minorToMajor(discount.value, discount.currency)
      : discount.value

  // minimumPurchaseAmount.amount is a minor-unit integer; Bumpa expects major-unit.
  const minimumPurchase = minorToMajor(
    discount.minimumPurchaseAmount?.amount,
    discount.minimumPurchaseAmount?.currency,
  )

  return {
    code: discount.code,
    name: discount.title,
    discount_type: type,
    value,
    applies_to: discount.appliesTo?.toLowerCase(),
    minimum_purchase: minimumPurchase,
    usage_limit: discount.usageLimit,
    product_ids: discount.productIds,
    collection_ids: discount.collectionIds,
    starts_at: discount.startsAt,
    ends_at: discount.endsAt,
  }
}
