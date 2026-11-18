/**
 * BetterCommerce Promotion/Voucher → canonical Discount.
 *
 * BetterCommerce exposes promotions/discount codes under
 * `/api/v2/commerce/promotion`. A promotion may carry a redeemable voucher
 * code, a discount value/type, and applicability rules.
 *
 * Field mapping:
 *  promoId / recordId      → id
 *  promoCode               → code
 *  name / description      → title
 *  discountType            → type (PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING)
 *  discountValue / value   → value (major → minor for FIXED_AMOUNT)
 *  applicability           → appliesTo
 *  minimumOrderValue       → minimumPurchaseAmount
 *  usageLimit              → usageLimit
 *  usageCount / redeemCount → usageCount
 *  startDate               → startsAt
 *  endDate                 → endsAt
 *  createdAt               → createdAt
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawBCPromotion {
  promoId?: string
  recordId?: string
  promoCode?: string
  code?: string
  name?: string
  description?: string | null
  discountType?: string | null
  discountValue?: number | string | null
  value?: number | string | null
  applicability?: string | null
  currencyCode?: string
  currency?: string
  minimumOrderValue?: number | string | null
  usageLimit?: number | null
  usageCount?: number | null
  redeemCount?: number | null
  customerEligibility?: string | null
  startDate?: string | null
  endDate?: string | null
  createdAt?: string
  [key: string]: unknown
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawBCPromotion): DiscountType | undefined {
  const t = (raw.discountType ?? '').toLowerCase()
  if (t === 'percentage' || t === 'percent') return 'PERCENTAGE'
  if (t === 'fixed' || t === 'fixedamount' || t === 'flat') return 'FIXED_AMOUNT'
  if (t === 'freeshipping' || t === 'free_shipping' || t === 'shipping') return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(raw: RawBCPromotion): DiscountAppliesTo | undefined {
  const a = (raw.applicability ?? '').toLowerCase()
  if (a === 'order' || a === 'all') return 'ORDER'
  if (a === 'product' || a === 'products' || a === 'lineitem') return 'PRODUCTS'
  if (a === 'shipping') return 'SHIPPING'
  return undefined
}

function mapEligibility(raw: RawBCPromotion): DiscountCustomerEligibility | undefined {
  const e = (raw.customerEligibility ?? '').toLowerCase()
  if (e === 'all' || e === 'everyone') return 'ALL'
  if (e === 'specific' || e === 'selected' || e === 'prerequisite') return 'SPECIFIC'
  return undefined
}

export function transformDiscount(raw: RawBCPromotion): Discount {
  const type = mapType(raw)
  const currency = raw.currencyCode ?? raw.currency ?? 'GBP'
  const rawValue = toNum(raw.discountValue ?? raw.value)
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(Math.abs(rawValue), currency)
      : Math.abs(rawValue)
  const minAmt = toNum(raw.minimumOrderValue)

  return {
    id: raw.promoId ?? raw.recordId ?? '',
    code: raw.promoCode ?? raw.code ?? undefined,
    title: raw.name ?? raw.description ?? undefined,
    type,
    value,
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      minAmt > 0
        ? { amount: majorToMinor(minAmt, currency), currency }
        : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? raw.redeemCount ?? undefined,
    customerEligibility: mapEligibility(raw),
    startsAt: raw.startDate ?? undefined,
    endsAt: raw.endDate ?? undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → BetterCommerce promotion body. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    PERCENTAGE: 'percentage',
    FIXED_AMOUNT: 'fixed',
    FREE_SHIPPING: 'freeshipping',
  }
  // For FIXED_AMOUNT discounts, `discount.value` is an integer minor-unit amount;
  // BC expects a major-unit decimal. PERCENTAGE values are plain numbers (no conversion).
  const discountValue =
    discount.type === 'FIXED_AMOUNT'
      ? minorToMajor(discount.value, discount.currency)
      : discount.value
  return {
    promoCode: discount.code,
    name: discount.title,
    discountType: discount.type ? typeMap[discount.type] : undefined,
    discountValue,
    // minimumPurchaseAmount.amount is integer minor units; BC expects major-unit decimal.
    minimumOrderValue: minorToMajor(
      discount.minimumPurchaseAmount?.amount,
      discount.minimumPurchaseAmount?.currency,
    ),
    usageLimit: discount.usageLimit,
    startDate: discount.startsAt,
    endDate: discount.endsAt,
  }
}
