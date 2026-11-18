/**
 * Medusa v2 Promotion → canonical Discount.
 *
 * Medusa v2 replaces the legacy "Discount" concept with "Promotions".
 * Promotions support percentage, fixed, and free shipping types via
 * `type` and `application_method`.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'

export interface RawMedusaApplicationMethod {
  type?: string // 'percentage' | 'fixed'
  value?: number
  max_quantity?: number | null
  target_type?: string // 'order' | 'items' | 'shipping_methods'
  currency_code?: string | null
  [key: string]: unknown
}

export interface RawMedusaPromotion {
  id: string
  code?: string | null
  is_automatic?: boolean
  type?: string // 'standard' | 'buyget'
  status?: string // 'active' | 'inactive' | 'draft'
  application_method?: RawMedusaApplicationMethod | null
  campaign_id?: string | null
  rules?: Array<{
    attribute?: string
    operator?: string
    values?: Array<{ value?: string }>
  }> | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapType(raw: RawMedusaPromotion): DiscountType | undefined {
  if (raw.type === 'buyget') return 'BUY_X_GET_Y'
  const method = raw.application_method
  if (!method) return undefined
  if (method.target_type === 'shipping_methods') return 'FREE_SHIPPING'
  switch (method.type) {
    case 'percentage':
      return 'PERCENTAGE'
    case 'fixed':
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawMedusaPromotion): DiscountAppliesTo | undefined {
  const target = raw.application_method?.target_type
  if (!target) return undefined
  switch (target) {
    case 'order':
      return 'ORDER'
    case 'items':
      return 'PRODUCTS'
    case 'shipping_methods':
      return 'SHIPPING'
    default:
      return undefined
  }
}

export function transformDiscount(raw: RawMedusaPromotion): Discount {
  const method = raw.application_method
  // For percentage, value is already a percentage (0-100). For fixed, it's in cents.
  const discountType = mapType(raw)
  let value = method?.value
  if (value != null && discountType === 'FIXED_AMOUNT') {
    // Medusa reports fixed-amount discounts in integer minor units (cents),
    // which is already the canonical representation — pass through.
    value = Math.round(value)
  }

  return {
    id: raw.id,
    code: raw.code ?? undefined,
    title: raw.code ?? undefined,
    type: discountType,
    value,
    currency: method?.currency_code ?? undefined,
    appliesTo: mapAppliesTo(raw),
    createdAt: raw.created_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let methodType: string | undefined
  let targetType: string | undefined
  let value = discount.value

  switch (discount.type) {
    case 'PERCENTAGE':
      methodType = 'percentage'
      targetType = discount.appliesTo === 'PRODUCTS' ? 'items' : 'order'
      break
    case 'FIXED_AMOUNT':
      methodType = 'fixed'
      targetType = discount.appliesTo === 'PRODUCTS' ? 'items' : 'order'
      if (value != null) value = Math.round(value)
      break
    case 'FREE_SHIPPING':
      methodType = 'fixed'
      targetType = 'shipping_methods'
      value = 0
      break
    case 'BUY_X_GET_Y':
      // buyget is a separate type at the promotion level
      break
    default:
      break
  }

  return {
    code: discount.code,
    type: discount.type === 'BUY_X_GET_Y' ? 'buyget' : 'standard',
    application_method: {
      type: methodType,
      value,
      target_type: targetType,
      currency_code: discount.currency,
    },
  }
}
