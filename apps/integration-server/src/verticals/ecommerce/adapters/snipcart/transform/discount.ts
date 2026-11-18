/**
 * Snipcart Discount → canonical Discount.
 *
 * Snipcart discounts are a single resource with `trigger`, `type`, `amount`,
 * `rate`, and optional `code`. The discount type (`FixedAmount`, `Rate`,
 * `Shipping`, etc.) maps directly to canonical DiscountType values.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/discounts
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Snipcart shape ────────────────────────────────────────────────────────

export interface RawSnipcartDiscount {
  id: string
  name?: string
  /** Trigger: 'Total' | 'Code' | 'Product' */
  trigger?: string
  code?: string | null
  itemId?: string | null
  totalToReach?: number | null
  /** Type: 'FixedAmount' | 'Rate' | 'AlternatePrice' | 'Shipping' | 'FixedAmountOnItems' */
  type?: string
  /** Major-unit fixed amount (e.g. 10.00). */
  amount?: number | null
  /** Percentage rate (0-100, e.g. 15 for 15%). */
  rate?: number | null
  alternatePrice?: string | null
  shippingDescription?: string | null
  shippingCost?: number | null
  shippingGuaranteedDaysToDelivery?: number | null
  maxNumberOfUsages?: number | null
  numberOfUsages?: number | null
  expires?: string | null
  combinable?: boolean
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(raw: RawSnipcartDiscount): DiscountType | undefined {
  switch (raw.type) {
    case 'FixedAmount':
    case 'FixedAmountOnItems':
      return 'FIXED_AMOUNT'
    case 'Rate':
      return 'PERCENTAGE'
    case 'Shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawSnipcartDiscount): DiscountAppliesTo | undefined {
  if (raw.type === 'Shipping') return 'SHIPPING'
  if (raw.trigger === 'Product' && raw.itemId) return 'PRODUCTS'
  return 'ORDER'
}

function discountValue(raw: RawSnipcartDiscount, type: DiscountType | undefined): number | undefined {
  if (type === 'PERCENTAGE') {
    return raw.rate != null ? Math.abs(raw.rate) : undefined
  }
  if (type === 'FIXED_AMOUNT') {
    return raw.amount != null ? majorToMinor(Math.abs(raw.amount), 'USD') : undefined
  }
  if (type === 'FREE_SHIPPING') {
    return raw.shippingCost != null ? majorToMinor(Math.abs(raw.shippingCost), 'USD') : 0
  }
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawSnipcartDiscount): Discount {
  const type = mapType(raw)
  const value = discountValue(raw, type)
  const appliesTo = mapAppliesTo(raw)

  return {
    id: raw.id,
    code: raw.code ?? undefined,
    title: raw.name,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? 'USD' : undefined,
    appliesTo,
    productIds: raw.itemId ? [raw.itemId] : undefined,
    collectionIds: undefined,
    minimumPurchaseAmount:
      raw.totalToReach != null && raw.totalToReach > 0
        ? { amount: majorToMinor(raw.totalToReach, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: raw.maxNumberOfUsages ?? undefined,
    usageCount: raw.numberOfUsages ?? undefined,
    customerEligibility: 'ALL',
    startsAt: undefined,
    endsAt: raw.expires ?? undefined,
    createdAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Snipcart discount body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: discount.title,
    trigger: discount.code ? 'Code' : discount.productIds?.length ? 'Product' : 'Total',
    code: discount.code,
    expires: discount.endsAt,
    maxNumberOfUsages: discount.usageLimit,
    combinable: true,
  }
  if (discount.type === 'PERCENTAGE') {
    body.type = 'Rate'
    body.rate = discount.value != null ? Math.abs(discount.value) : undefined
  } else if (discount.type === 'FIXED_AMOUNT') {
    body.type = 'FixedAmount'
    // Convert canonical minor units back to major-unit decimal.
    body.amount =
      discount.value != null ? minorToMajor(discount.value, discount.currency ?? 'USD') : undefined
  } else if (discount.type === 'FREE_SHIPPING') {
    body.type = 'Shipping'
    body.shippingCost = 0
  }
  if (discount.minimumPurchaseAmount) {
    body.totalToReach = minorToMajor(
      discount.minimumPurchaseAmount.amount,
      discount.minimumPurchaseAmount.currency,
    )
    body.trigger = 'Total'
  }
  if (discount.productIds?.[0]) {
    body.itemId = discount.productIds[0]
    body.trigger = 'Product'
  }
  return body
}
