/**
 * Magento Sales Rule + Coupon → canonical Discount.
 *
 * Magento splits the discount concept across two REST resources:
 *
 *  - `/V1/salesRules` — the rule itself (conditions, actions, usage
 *    limits, dates).
 *  - `/V1/coupons` — the redeemable codes that reference a rule.
 *
 * A canonical Discount flattens both: we keep the rule's id as the
 * canonical id, and overlay the first coupon's `code` / `times_used`
 * / `usage_limit` on top. Callers that need the full coupon catalogue
 * can read it from `metadata`.
 *
 * Rule action types:
 *  - `by_percent`   → PERCENTAGE
 *  - `by_fixed`     → FIXED_AMOUNT
 *  - `cart_fixed`   → FIXED_AMOUNT
 *  - `buy_x_get_y`  → BUY_X_GET_Y
 *
 * If `simple_free_shipping` is truthy we emit FREE_SHIPPING regardless
 * of the action value.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawMagentoSalesRule {
  rule_id: number
  name: string
  description?: string
  website_ids?: number[]
  customer_group_ids?: number[]
  from_date?: string | null
  to_date?: string | null
  uses_per_customer?: number
  is_active?: boolean
  stop_rules_processing?: boolean
  is_advanced?: boolean
  sort_order?: number
  simple_action?: string // by_percent | by_fixed | cart_fixed | buy_x_get_y
  discount_amount?: number
  discount_qty?: number
  discount_step?: number
  apply_to_shipping?: boolean
  times_used?: number
  is_rss?: boolean
  coupon_type?: string // NO_COUPON | SPECIFIC_COUPON | AUTO
  use_auto_generation?: boolean
  uses_per_coupon?: number
  simple_free_shipping?: number | boolean
  extension_attributes?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawMagentoCoupon {
  coupon_id?: number
  rule_id: number
  code: string
  usage_limit?: number
  usage_per_customer?: number
  times_used?: number
  expiration_date?: string | null
  is_primary?: boolean
  created_at?: string
  type?: number
  [key: string]: unknown
}

function mapType(raw: RawMagentoSalesRule): DiscountType | undefined {
  if (raw.simple_free_shipping) return 'FREE_SHIPPING'
  switch (raw.simple_action) {
    case 'by_percent':
      return 'PERCENTAGE'
    case 'by_fixed':
    case 'cart_fixed':
      return 'FIXED_AMOUNT'
    case 'buy_x_get_y':
      return 'BUY_X_GET_Y'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawMagentoSalesRule): DiscountAppliesTo | undefined {
  if (raw.simple_free_shipping || raw.apply_to_shipping) return 'SHIPPING'
  if (raw.simple_action === 'cart_fixed') return 'ORDER'
  if (raw.simple_action === 'by_percent' || raw.simple_action === 'by_fixed') {
    return 'PRODUCTS'
  }
  return undefined
}

export function transformDiscount(
  raw: RawMagentoSalesRule,
  coupon?: RawMagentoCoupon,
): Discount {
  return {
    id: String(raw.rule_id),
    code: coupon?.code,
    title: raw.name,
    type: mapType(raw),
    value:
      mapType(raw) === 'FIXED_AMOUNT'
        ? majorToMinor(raw.discount_amount)
        : raw.discount_amount,
    appliesTo: mapAppliesTo(raw),
    usageLimit: coupon?.usage_limit ?? raw.uses_per_customer ?? undefined,
    usageCount: coupon?.times_used ?? raw.times_used ?? undefined,
    startsAt: raw.from_date ?? undefined,
    endsAt: raw.to_date ?? coupon?.expiration_date ?? undefined,
    createdAt: coupon?.created_at,
    metadata: {
      ...(raw as Record<string, unknown>),
      coupon: coupon as Record<string, unknown> | undefined,
    },
  }
}

export function untransformDiscount(discount: Partial<Discount>): {
  rule: Record<string, unknown>
  coupon?: Record<string, unknown>
} {
  let simple_action: string | undefined
  let simple_free_shipping: number | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      simple_action = 'by_percent'
      break
    case 'FIXED_AMOUNT':
      simple_action = discount.appliesTo === 'ORDER' ? 'cart_fixed' : 'by_fixed'
      break
    case 'FREE_SHIPPING':
      simple_free_shipping = 1
      break
    case 'BUY_X_GET_Y':
      simple_action = 'buy_x_get_y'
      break
    default:
      break
  }

  const rule: Record<string, unknown> = {
    name: discount.title ?? discount.code ?? 'Discount',
    description: discount.title,
    website_ids: [1],
    customer_group_ids: [0, 1],
    is_active: true,
    stop_rules_processing: false,
    is_advanced: true,
    simple_action,
    discount_amount:
      discount.type === 'FIXED_AMOUNT' && discount.value != null
        ? discount.value / 100
        : discount.value,
    apply_to_shipping: discount.appliesTo === 'SHIPPING',
    simple_free_shipping,
    from_date: discount.startsAt,
    to_date: discount.endsAt,
    uses_per_customer: discount.usageLimit,
    coupon_type: discount.code ? 'SPECIFIC_COUPON' : 'NO_COUPON',
  }

  const coupon: Record<string, unknown> | undefined = discount.code
    ? {
        code: discount.code,
        usage_limit: discount.usageLimit,
        expiration_date: discount.endsAt,
      }
    : undefined

  return { rule, coupon }
}
