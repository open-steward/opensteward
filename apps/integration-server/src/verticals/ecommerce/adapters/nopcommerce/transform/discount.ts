/**
 * nopCommerce Discount → canonical Discount.
 *
 * nopCommerce discounts are first-class resources under `/api/` (via the
 * Web API plugin). Key mapping:
 *
 *  - `discount_type_id`:
 *      1 = AssignedToOrderSubTotal  → FIXED_AMOUNT (ORDER)
 *      2 = AssignedToProducts       → FIXED_AMOUNT (PRODUCTS)
 *      5 = AssignedToOrderTotal     → FIXED_AMOUNT (ORDER)
 *      6 = AssignedToCategories     → FIXED_AMOUNT (PRODUCTS)
 *      10 = AssignedToShipping      → FREE_SHIPPING (SHIPPING)
 *
 *  - `use_percentage` boolean overrides to PERCENTAGE type
 *  - `discount_percentage` and `discount_amount` are the values
 *  - `coupon_code` maps to `code`
 *  - `start_date_utc` / `end_date_utc` → `startsAt` / `endsAt`
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'

export interface RawNopDiscount {
  id: number | string
  name?: string | null
  discount_type_id?: number
  use_percentage?: boolean
  discount_percentage?: number
  discount_amount?: number
  max_discount_amount?: number | null
  coupon_code?: string | null
  require_coupon_code?: boolean
  start_date_utc?: string | null
  end_date_utc?: string | null
  is_cumulative?: boolean
  discount_limitation_id?: number
  limitation_times?: number
  applied_to_sub_categories?: boolean
  currency?: string
  [key: string]: unknown
}

function mapType(raw: RawNopDiscount): DiscountType | undefined {
  if (raw.use_percentage === true) return 'PERCENTAGE'
  if (raw.discount_type_id === 10) return 'FREE_SHIPPING'
  if (raw.discount_amount != null && raw.discount_amount > 0) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawNopDiscount): DiscountAppliesTo | undefined {
  switch (raw.discount_type_id) {
    case 1: // AssignedToOrderSubTotal
    case 5: // AssignedToOrderTotal
      return 'ORDER'
    case 2: // AssignedToProducts
    case 6: // AssignedToCategories
      return 'PRODUCTS'
    case 10: // AssignedToShipping
      return 'SHIPPING'
    default:
      return undefined
  }
}

export function transformDiscount(raw: RawNopDiscount): Discount {
  const value = raw.use_percentage === true
    ? raw.discount_percentage ?? 0
    : raw.discount_amount ?? 0

  return {
    id: String(raw.id),
    code: raw.coupon_code ?? undefined,
    title: raw.name ?? undefined,
    type: mapType(raw),
    value,
    appliesTo: mapAppliesTo(raw),
    usageLimit: raw.limitation_times ?? undefined,
    startsAt: raw.start_date_utc ?? undefined,
    endsAt: raw.end_date_utc ?? undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let discount_type_id: number | undefined
  let use_percentage: boolean | undefined

  switch (discount.type) {
    case 'PERCENTAGE':
      use_percentage = true
      discount_type_id = discount.appliesTo === 'PRODUCTS' ? 2 : 1
      break
    case 'FIXED_AMOUNT':
      use_percentage = false
      discount_type_id = discount.appliesTo === 'PRODUCTS' ? 2 : 1
      break
    case 'FREE_SHIPPING':
      discount_type_id = 10
      break
    default:
      break
  }

  return {
    name: discount.title,
    coupon_code: discount.code,
    discount_type_id,
    use_percentage,
    discount_percentage: discount.type === 'PERCENTAGE' ? discount.value : undefined,
    discount_amount: discount.type === 'FIXED_AMOUNT' ? discount.value : undefined,
    start_date_utc: discount.startsAt,
    end_date_utc: discount.endsAt,
    limitation_times: discount.usageLimit,
  }
}
