/**
 * SendOwl Discount → canonical Discount.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/discounts
 *
 * A discount carries exactly one of `fixed_discount` / `percentage_discount`
 * (both decimal strings). SendOwl discounts have no currency field of their
 * own, and the API never echoes back which account currency `minimum_cart_value`
 * / `fixed_discount` are denominated in. Rather than guess a currency, this
 * module reports `value` as a bare number (the schema documents its unit as
 * "money amount in `currency`" only when `currency` is set) and never
 * populates `minimumPurchaseAmount` — a `Money`, whose `currency` is
 * required — since we have no honest value for it.
 */
import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawSendOwlDiscount {
  id: number | string
  name?: string
  code?: string
  fixed_discount?: string
  percentage_discount?: string
  usage_limit?: number
  minimum_cart_value?: number
  expires_at?: string
  created_at?: string
  updated_at?: string
  multiple_codes?: boolean
  limited_to_products?: boolean
  [key: string]: unknown
}

function discountTypeAndValue(raw: RawSendOwlDiscount): { type?: DiscountType; value?: number } {
  if (raw.percentage_discount != null) {
    return { type: 'PERCENTAGE', value: Number(raw.percentage_discount) }
  }
  if (raw.fixed_discount != null) {
    return { type: 'FIXED_AMOUNT', value: Number(raw.fixed_discount) }
  }
  return {}
}

export function transformDiscount(raw: RawSendOwlDiscount): Discount {
  const { type, value } = discountTypeAndValue(raw)
  return {
    id: String(raw.id),
    code: raw.code,
    title: raw.name,
    type,
    value,
    // No `currency` — SendOwl never reports which account currency a
    // discount's fixed/minimum amounts are denominated in. `minimumPurchaseAmount`
    // (a `Money`, whose `currency` is required) is left unset for the same
    // reason; `minimum_cart_value` is still reachable via `metadata`.
    usageLimit: raw.usage_limit,
    endsAt: raw.expires_at,
    createdAt: raw.created_at,
    metadata: { ...raw },
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body['name'] = discount.title
  if (discount.code != null) body['code'] = discount.code
  if (discount.type === 'PERCENTAGE' && discount.value != null) {
    body['percentage_discount'] = String(discount.value)
  } else if (discount.type === 'FIXED_AMOUNT' && discount.value != null) {
    body['fixed_discount'] = String(discount.value)
  }
  if (discount.usageLimit != null) body['usage_limit'] = discount.usageLimit
  if (discount.endsAt != null) body['expires_at'] = discount.endsAt
  if (discount.minimumPurchaseAmount != null) {
    body['minimum_cart_value'] = discount.minimumPurchaseAmount.amount / 100
  }
  return body
}
