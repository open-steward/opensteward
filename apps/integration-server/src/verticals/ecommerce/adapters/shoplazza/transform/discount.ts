/**
 * Shoplazza PriceRule (+ DiscountCode) → canonical Discount.
 *
 * Shoplazza splits discounts into two resources (matching the Shopify model):
 *  - PriceRule: the discount configuration (value, type, prerequisites)
 *  - DiscountCode: the redeemable code(s) attached to a rule
 *
 * Endpoints (2022-01 version):
 *   GET /openapi/2022-01/price_rules
 *   GET /openapi/2022-01/price_rules/{id}/discount_codes
 *
 * Note: v2026-01 consolidates these under /discounts; this adapter targets
 * 2025-06 which still uses price_rules.
 *
 * Docs: https://www.shoplazza.dev/reference/scope-list (read_price_rules)
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawShoplazzaPrerequisiteSubtotal {
  greater_than_or_equal_to: string | number
}

export interface RawShoplazzaPriceRule {
  id: number | string
  title?: string
  /** 'line_item' | 'shipping_line' */
  target_type?: string
  /** 'all' | 'entitled' */
  target_selection?: string
  allocation_method?: string
  /** 'percentage' | 'fixed_amount' */
  value_type?: string
  /** Negative decimal string (e.g. "-10.0") */
  value?: string | number
  /** 'all' | 'prerequisite' */
  customer_selection?: string
  prerequisite_subtotal_range?: RawShoplazzaPrerequisiteSubtotal | null
  usage_limit?: number | null
  entitled_product_ids?: Array<number | string>
  entitled_collection_ids?: Array<number | string>
  starts_at?: string | null
  ends_at?: string | null
  created_at?: string
  [key: string]: unknown
}

export interface RawShoplazzaDiscountCode {
  id?: number | string
  code?: string
  usage_count?: number
  price_rule_id?: number | string
}

const APPLIES_TO_MAP: Record<string, DiscountAppliesTo> = {
  line_item: 'PRODUCTS',
  shipping_line: 'SHIPPING',
}

const ELIGIBILITY_MAP: Record<string, DiscountCustomerEligibility> = {
  all: 'ALL',
  prerequisite: 'SPECIFIC',
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(rule: RawShoplazzaPriceRule): DiscountType | undefined {
  if (rule.target_type === 'shipping_line') return 'FREE_SHIPPING'
  if (rule.value_type === 'percentage') return 'PERCENTAGE'
  if (rule.value_type === 'fixed_amount') return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(rule: RawShoplazzaPriceRule): DiscountAppliesTo | undefined {
  if (!rule.target_type) return undefined
  if (rule.target_type === 'line_item' && rule.target_selection === 'all') return 'ORDER'
  return APPLIES_TO_MAP[rule.target_type] ?? undefined
}

export function transformDiscount(
  rule: RawShoplazzaPriceRule,
  code?: RawShoplazzaDiscountCode,
): Discount {
  // Shoplazza stores `value` as a positive number (e.g. 20 for a $20 discount).
  const rawValue = toNum(rule.value)
  const type = mapType(rule)
  // Fixed-amount values are major-unit money → convert to minor units.
  // Percentage values are kept as-is (not money).
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(Math.abs(rawValue), 'USD')
      : Math.abs(rawValue)
  const minimumAmount = rule.prerequisite_subtotal_range
    ? toNum(rule.prerequisite_subtotal_range.greater_than_or_equal_to)
    : undefined

  return {
    id: String(rule.id),
    code: code?.code,
    title: rule.title,
    type,
    value,
    appliesTo: mapAppliesTo(rule),
    productIds: rule.entitled_product_ids?.map((p) => String(p)),
    collectionIds: rule.entitled_collection_ids?.map((c) => String(c)),
    minimumPurchaseAmount:
      minimumAmount != null && minimumAmount > 0
        ? { amount: majorToMinor(minimumAmount, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: rule.usage_limit ?? undefined,
    usageCount: code?.usage_count,
    customerEligibility: rule.customer_selection
      ? ELIGIBILITY_MAP[rule.customer_selection] ?? undefined
      : undefined,
    startsAt: rule.starts_at ?? undefined,
    endsAt: rule.ends_at ?? undefined,
    createdAt: rule.created_at,
    metadata: { rule, code } as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const valueType = discount.type === 'PERCENTAGE' ? 'percentage' : 'fixed_amount'
  // Shoplazza expects positive decimal major-unit values for fixed_amount
  // (e.g. 20 for a $20 discount). FIXED_AMOUNT values on the canonical Discount
  // are integer minor units; convert back to major units using the discount
  // currency. PERCENTAGE values are plain numbers (not money).
  let value: number | undefined
  if (discount.value != null) {
    value =
      discount.type === 'FIXED_AMOUNT'
        ? (minorToMajor(Math.abs(discount.value), discount.currency) ??
          Math.abs(discount.value))
        : Math.abs(discount.value)
  }
  return {
    title: discount.title,
    target_type: discount.appliesTo === 'SHIPPING' ? 'shipping_line' : 'line_item',
    target_selection: discount.appliesTo === 'ORDER' ? 'all' : 'entitled',
    allocation_method: 'across',
    value_type: valueType,
    value: value?.toString(),
    customer_selection: discount.customerEligibility === 'SPECIFIC' ? 'prerequisite' : 'all',
    starts_at: discount.startsAt,
    ends_at: discount.endsAt,
    usage_limit: discount.usageLimit,
    entitled_product_ids: discount.productIds,
    entitled_collection_ids: discount.collectionIds,
  }
}
