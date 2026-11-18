/**
 * fabric Promotion/Discount → canonical Discount.
 *
 * fabric promotions endpoint: `GET /v3/promotions`.
 * Each promotion has `code`, `title`, `type`, `value`, `currency`,
 * `applies_to`, `product_ids`, `collection_ids`, `starts_at`, `ends_at`.
 *
 * Type mapping:
 *   - percentage    → PERCENTAGE
 *   - fixed_amount  → FIXED_AMOUNT
 *   - free_shipping → FREE_SHIPPING
 *   - buy_x_get_y   → BUY_X_GET_Y
 */

import type { Discount, DiscountType, DiscountAppliesTo, DiscountCustomerEligibility } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawFabricPromotion {
  id: string
  code?: string
  title?: string
  type?: string // percentage | fixed_amount | free_shipping | buy_x_get_y
  value?: number
  currency?: string
  applies_to?: string // order | products | shipping
  product_ids?: string[]
  collection_ids?: string[]
  minimum_purchase_amount?: number
  minimum_purchase_currency?: string
  usage_limit?: number
  usage_count?: number
  customer_eligibility?: string // all | specific
  starts_at?: string
  ends_at?: string
  created_at?: string
  [key: string]: unknown
}

function mapType(type: string | undefined): DiscountType | undefined {
  switch (type) {
    case 'percentage': return 'PERCENTAGE'
    case 'fixed_amount': return 'FIXED_AMOUNT'
    case 'free_shipping': return 'FREE_SHIPPING'
    case 'buy_x_get_y': return 'BUY_X_GET_Y'
    default: return 'unknown'
  }
}

function mapAppliesTo(appliesTo: string | undefined): DiscountAppliesTo | undefined {
  switch (appliesTo) {
    case 'order': return 'ORDER'
    case 'products': return 'PRODUCTS'
    case 'shipping': return 'SHIPPING'
    default: return 'unknown'
  }
}

function mapCustomerEligibility(eligibility: string | undefined): DiscountCustomerEligibility | undefined {
  switch (eligibility) {
    case 'all': return 'ALL'
    case 'specific': return 'SPECIFIC'
    default: return 'unknown'
  }
}

export function transformDiscount(raw: RawFabricPromotion): Discount {
  return {
    id: raw.id,
    code: raw.code,
    title: raw.title,
    type: mapType(raw.type),
    value: raw.value,
    currency: raw.currency,
    appliesTo: mapAppliesTo(raw.applies_to),
    productIds: raw.product_ids,
    collectionIds: raw.collection_ids,
    minimumPurchaseAmount:
      raw.minimum_purchase_amount != null
        ? {
            amount: majorToMinor(
              raw.minimum_purchase_amount,
              raw.minimum_purchase_currency ?? raw.currency ?? 'USD',
            ),
            currency: raw.minimum_purchase_currency ?? raw.currency ?? 'USD',
          }
        : undefined,
    usageLimit: raw.usage_limit,
    usageCount: raw.usage_count,
    customerEligibility: mapCustomerEligibility(raw.customer_eligibility),
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    createdAt: raw.created_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let type: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE': type = 'percentage'; break
    case 'FIXED_AMOUNT': type = 'fixed_amount'; break
    case 'FREE_SHIPPING': type = 'free_shipping'; break
    case 'BUY_X_GET_Y': type = 'buy_x_get_y'; break
    default: break
  }

  return {
    code: discount.code,
    title: discount.title,
    type: type ?? 'fixed_amount',
    value: discount.value,
    currency: discount.currency,
    applies_to: discount.appliesTo?.toLowerCase(),
    product_ids: discount.productIds,
    collection_ids: discount.collectionIds,
    starts_at: discount.startsAt,
    ends_at: discount.endsAt,
  }
}
