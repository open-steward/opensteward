/**
 * Sapo PriceRule (+ DiscountCode) → canonical Discount.
 *
 * Sapo splits discounts into two resources (same structure as Shopify):
 *  - PriceRule: the rule itself (value, type, prerequisites, usage limits)
 *  - DiscountCode: the redeemable code(s) attached to a rule
 *
 * Sapo uses `created_on` for the timestamp and VND as the default currency
 * for money values. The `value` field is a negative decimal for discounts
 * (e.g. "-10.0") — we flip the sign for canonical representation.
 *
 * Docs:
 *   https://support.sapo.vn/price-rule
 *   https://support.sapo.vn/discountcode
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapoPrerequisiteSubtotal {
  greater_than_or_equal_to: string | number
}

export interface RawSapoPriceRule {
  id: number | string
  title?: string
  target_type?: string       // 'line_item' | 'shipping_line'
  target_selection?: string  // 'all' | 'entitled'
  allocation_method?: string
  value_type?: string        // 'percentage' | 'fixed_amount'
  value?: string | number    // negative
  customer_selection?: string // 'all' | 'prerequisite'
  prerequisite_subtotal_range?: RawSapoPrerequisiteSubtotal | null
  usage_limit?: number | null
  entitled_product_ids?: Array<number | string>
  entitled_collection_ids?: Array<number | string>
  starts_at?: string | null
  ends_at?: string | null
  /** Sapo: `created_on` */
  created_on?: string
  [key: string]: unknown
}

export interface RawSapoDiscountCode {
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

function mapType(rule: RawSapoPriceRule): DiscountType | undefined {
  if (rule.target_type === 'shipping_line') return 'FREE_SHIPPING'
  if (rule.value_type === 'percentage') return 'PERCENTAGE'
  if (rule.value_type === 'fixed_amount') return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(rule: RawSapoPriceRule): DiscountAppliesTo | undefined {
  if (!rule.target_type) return undefined
  if (rule.target_type === 'line_item' && rule.target_selection === 'all') return 'ORDER'
  return APPLIES_TO_MAP[rule.target_type] ?? undefined
}

export function transformDiscount(
  rule: RawSapoPriceRule,
  code?: RawSapoDiscountCode,
): Discount {
  // Sapo stores `value` as a negative string (e.g. "-10.0"); flip sign.
  const rawValue = toNum(rule.value)
  const type = mapType(rule)
  // Fixed-amount discount values are major-unit money (VND) → convert to minor units.
  // Percentage values are kept as-is.
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(Math.abs(rawValue), 'VND')
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
        ? { amount: majorToMinor(minimumAmount, 'VND'), currency: 'VND' }
        : undefined,
    usageLimit: rule.usage_limit ?? undefined,
    usageCount: code?.usage_count,
    customerEligibility: rule.customer_selection
      ? ELIGIBILITY_MAP[rule.customer_selection] ?? undefined
      : undefined,
    startsAt: rule.starts_at ?? undefined,
    endsAt: rule.ends_at ?? undefined,
    createdAt: rule.created_on,
    metadata: { rule, code } as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const isFreeShipping = discount.type === 'FREE_SHIPPING'
  // FREE_SHIPPING uses target_type=shipping_line and omits value_type entirely.
  // PERCENTAGE → value_type=percentage; FIXED_AMOUNT → value_type=fixed_amount.
  const valueType = isFreeShipping
    ? undefined
    : discount.type === 'PERCENTAGE'
      ? 'percentage'
      : 'fixed_amount'
  // Sapo expects negative values.
  const value = discount.value != null ? -Math.abs(discount.value) : undefined
  return {
    title: discount.title,
    target_type: isFreeShipping || discount.appliesTo === 'SHIPPING' ? 'shipping_line' : 'line_item',
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
