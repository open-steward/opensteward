/**
 * JTL-Shop Coupon (Gutschein) → canonical Discount.
 *
 * JTL-Shop discounts are modelled as "Gutscheine" (coupons) available under
 * `/api/v1/coupons`. Key fields:
 *  - `id`, `code` — the redeemable coupon code
 *  - `name` / `title` — description
 *  - `type` — 'percentage' | 'fixed' | 'shipping'
 *  - `value` — for percentage: 0–100; for fixed: decimal major-unit amount
 *  - `currency` — ISO 4217 (for fixed-amount coupons)
 *  - `minimumOrderValue` — decimal gross minimum purchase
 *  - `usageLimit`, `usageCount`
 *  - `customerEligibility` — 'all' | 'specific'
 *  - `productIds`, `categoryIds` — for scoped coupons
 *  - `validFrom`, `validUntil` — ISO 8601 timestamps
 *  - `created` — ISO 8601 timestamp
 *
 * Fixed-amount `value` is decimal major-unit → convert to minor units.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopCoupon {
  id: number | string
  code?: string | null
  name?: string | null
  title?: string | null
  /** 'percentage' | 'fixed' | 'shipping' */
  type?: string | null
  /** For percentage: 0–100; for fixed: decimal gross amount */
  value?: number | string | null
  currency?: string | null
  minimumOrderValue?: number | string | null
  usageLimit?: number | null
  usageCount?: number | null
  /** 'all' | 'specific' */
  customerEligibility?: string | null
  productIds?: Array<number | string>
  categoryIds?: Array<number | string>
  validFrom?: string | null
  validUntil?: string | null
  created?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(type: string | null | undefined): DiscountType | undefined {
  if (!type) return undefined
  switch (type.toLowerCase()) {
    case 'percentage':
      return 'PERCENTAGE'
    case 'fixed':
      return 'FIXED_AMOUNT'
    case 'shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(
  productIds: Array<number | string> | undefined,
  categoryIds: Array<number | string> | undefined,
): DiscountAppliesTo | undefined {
  if (productIds && productIds.length > 0) return 'PRODUCTS'
  if (categoryIds && categoryIds.length > 0) return 'PRODUCTS'
  return 'ORDER'
}

const ELIGIBILITY_MAP: Record<string, DiscountCustomerEligibility> = {
  all: 'ALL',
  specific: 'SPECIFIC',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawJtlShopCoupon): Discount {
  const currency = raw.currency ?? 'EUR'
  const type = mapType(raw.type)
  const rawValue = toNum(raw.value)
  // Fixed-amount values are decimal major-unit; convert to minor units.
  // Percentage values stay as-is (not money).
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, currency) : rawValue

  const minOrderRaw = raw.minimumOrderValue != null ? toNum(raw.minimumOrderValue) : null

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.title ?? raw.name ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: mapAppliesTo(raw.productIds, raw.categoryIds),
    productIds: raw.productIds?.map((p) => String(p)),
    collectionIds: raw.categoryIds?.map((c) => String(c)),
    minimumPurchaseAmount:
      minOrderRaw != null && minOrderRaw > 0
        ? { amount: majorToMinor(minOrderRaw, currency), currency }
        : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? undefined,
    customerEligibility: raw.customerEligibility
      ? ELIGIBILITY_MAP[raw.customerEligibility.toLowerCase()] ?? undefined
      : undefined,
    startsAt: raw.validFrom ?? undefined,
    endsAt: raw.validUntil ?? undefined,
    createdAt: raw.created ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → JTL-Shop coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    PERCENTAGE: 'percentage',
    FIXED_AMOUNT: 'fixed',
    FREE_SHIPPING: 'shipping',
  }
  const fixedCurrency = discount.currency ?? 'EUR'
  const rawValue =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, fixedCurrency)
      : discount.value

  return {
    code: discount.code,
    title: discount.title,
    type: discount.type ? (typeMap[discount.type] ?? undefined) : undefined,
    value: rawValue,
    currency: discount.currency,
    minimumOrderValue:
      discount.minimumPurchaseAmount?.amount != null
        ? minorToMajor(discount.minimumPurchaseAmount.amount, discount.minimumPurchaseAmount.currency ?? 'EUR')
        : undefined,
    usageLimit: discount.usageLimit,
    customerEligibility:
      discount.customerEligibility === 'SPECIFIC' ? 'specific' : 'all',
    productIds: discount.productIds,
    categoryIds: discount.collectionIds,
    validFrom: discount.startsAt,
    validUntil: discount.endsAt,
  }
}
