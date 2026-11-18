/**
 * Swell coupon → canonical Discount.
 *
 * Fields read, from the coupon model
 * (https://developers.swell.is/backend-api/coupons):
 *   id, name ("A short descriptive name of the coupon."), codes ("Expandable
 *   list of codes used to identify the coupon."; the documented example is
 *   `"codes": [{ "code": "WINTER10" }]`), multi_codes ("Indicates the coupon
 *   is identified by multiple coupon codes."), currency, date_valid ("Date
 *   the coupon is first available for use."), date_expired, date_created,
 *   limit_uses ("Maximum number of times the coupon can be applied across all
 *   customers."), use_count ("Number of times the coupon has been used."),
 *   and discounts[] ("List of discount rules to apply.") with
 *     type        "Can be total, product, category, or shipment." (+ buy_get)
 *     value_type  "Can be fixed or percent."
 *     value_fixed "Fixed discount applied when value_type=fixed."
 *     value_percent "Percentage discount applied when value_type=percent."
 *     product_id, category_id, total_min ("Minimum order total required for
 *     the rule to apply.").
 *
 * The canonical Discount holds one rule, so type, value, targets and minimum
 * are read only from a coupon with exactly one rule; a multi-rule coupon
 * keeps them in `metadata`. `code` is read only when the coupon has a single
 * code. Money needs `currency`.
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawSwellCouponRule {
  type?: string | null
  value_type?: string | null
  value_fixed?: number | null
  value_percent?: number | null
  product_id?: string | null
  category_id?: string | null
  total_min?: number | null
  [key: string]: unknown
}

export interface RawSwellCoupon {
  id: string
  name?: string | null
  codes?: Array<{ code?: string | null }> | null
  multi_codes?: boolean | null
  currency?: string | null
  discounts?: RawSwellCouponRule[] | null
  limit_uses?: number | null
  use_count?: number | null
  date_valid?: string | null
  date_expired?: string | null
  date_created?: string | null
  [key: string]: unknown
}

function ruleType(r: RawSwellCouponRule): DiscountType | undefined {
  if (r.type === 'buy_get') return 'BUY_X_GET_Y'
  if (r.value_type === 'percent') return 'PERCENTAGE'
  if (r.value_type === 'fixed') return 'FIXED_AMOUNT'
  return undefined
}

/**
 * A PERCENTAGE value is a percent. A FIXED_AMOUNT value is money: the coupon
 * model types `value_fixed` as `currency` (a major-unit decimal), and the
 * vertical carries FIXED_AMOUNT values in minor units of `currency`, as the
 * reference adapter does. So it is scaled, and omitted without a currency.
 */
function ruleValue(r: RawSwellCouponRule, currency: string | undefined): number | undefined {
  if (r.value_type === 'percent') return r.value_percent ?? undefined
  if (r.value_type === 'fixed') {
    return r.value_fixed != null && currency ? majorToMinor(r.value_fixed, currency) : undefined
  }
  return undefined
}

function ruleAppliesTo(r: RawSwellCouponRule): DiscountAppliesTo | undefined {
  switch (r.type) {
    case 'total':
      return 'ORDER'
    case 'product':
    case 'category':
    case 'buy_get':
      return 'PRODUCTS'
    case 'shipment':
      return 'SHIPPING'
    default:
      return undefined
  }
}

export function transformDiscount(raw: RawSwellCoupon): Discount {
  const currency = raw.currency ?? undefined
  const rule = raw.discounts?.length === 1 ? raw.discounts[0] : undefined
  const code =
    raw.multi_codes !== true && raw.codes?.length === 1
      ? (raw.codes[0]?.code ?? undefined)
      : undefined
  const value = rule ? ruleValue(rule, currency) : undefined

  return {
    id: raw.id,
    code,
    title: raw.name ?? undefined,
    type: rule ? ruleType(rule) : undefined,
    value: value != null && value >= 0 ? value : undefined,
    currency,
    appliesTo: rule ? ruleAppliesTo(rule) : undefined,
    productIds: rule?.product_id ? [rule.product_id] : undefined,
    collectionIds: rule?.category_id ? [rule.category_id] : undefined,
    minimumPurchaseAmount:
      rule?.total_min != null && currency
        ? { amount: majorToMinor(rule.total_min, currency), currency }
        : undefined,
    usageLimit: raw.limit_uses ?? undefined,
    usageCount: raw.use_count ?? undefined,
    startsAt: raw.date_valid ?? undefined,
    endsAt: raw.date_expired ?? undefined,
    createdAt: raw.date_created ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.code !== undefined) body['code'] = discount.code
  if (discount.title !== undefined) body['name'] = discount.title
  if (discount.value !== undefined) body['value'] = discount.value
  if (discount.productIds !== undefined) body['product_ids'] = discount.productIds
  if (discount.collectionIds !== undefined) body['category_ids'] = discount.collectionIds
  if (discount.usageLimit !== undefined) body['limit_account_uses'] = discount.usageLimit
  if (discount.startsAt !== undefined) body['date_start'] = discount.startsAt
  if (discount.endsAt !== undefined) body['date_end'] = discount.endsAt
  if (discount.minimumPurchaseAmount?.amount != null) {
    body['minimum_order_amount'] = discount.minimumPurchaseAmount.amount
  }

  switch (discount.type) {
    case 'PERCENTAGE':
      body['type'] = 'percentage'
      break
    case 'FIXED_AMOUNT':
      body['type'] = 'fixed'
      break
    case 'FREE_SHIPPING':
      body['type'] = 'shipment'
      break
    default:
      break
  }

  return body
}
