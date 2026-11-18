/**
 * Sylius Promotion -> canonical Discount.
 *
 * Sylius promotions live under `/api/v2/admin/promotions` and carry:
 *  - `code`, `name`, `description`
 *  - `startsAt` / `endsAt`
 *  - `usageLimit` / `used`
 *  - `exclusive`, `couponBased`, `priority`
 *  - Actions define the discount type (percentage, fixed, unit_fixed, etc.)
 *  - Rules define eligibility
 *
 * Discount type is inferred from actions:
 *  - `order_percentage_discount` / `unit_percentage_discount` -> PERCENTAGE
 *  - `order_fixed_discount` / `unit_fixed_discount` -> FIXED_AMOUNT
 *  - `shipping_percentage_discount` -> FREE_SHIPPING (approximation)
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'

export interface RawSyliusPromotionAction {
  id?: number | string
  type?: string
  configuration?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawSyliusPromotionRule {
  id?: number | string
  type?: string
  configuration?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawSyliusPromotionCoupon {
  id?: number | string
  code?: string
  used?: number
  perCustomerUsageLimit?: number | null
  usageLimit?: number | null
  [key: string]: unknown
}

export interface RawSyliusPromotion {
  id: number | string
  code: string
  name?: string
  description?: string | null
  startsAt?: string | null
  endsAt?: string | null
  usageLimit?: number | null
  used?: number
  exclusive?: boolean
  couponBased?: boolean
  priority?: number
  actions?: RawSyliusPromotionAction[]
  rules?: RawSyliusPromotionRule[]
  coupons?: RawSyliusPromotionCoupon[]
  channels?: Array<{ code?: string }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function inferType(actions: RawSyliusPromotionAction[] | undefined): DiscountType | undefined {
  if (!actions || actions.length === 0) return undefined
  const first = actions[0]
  if (!first?.type) return undefined
  if (first.type.includes('shipping')) return 'FREE_SHIPPING'
  if (first.type.includes('percentage')) return 'PERCENTAGE'
  if (first.type.includes('fixed')) return 'FIXED_AMOUNT'
  return undefined
}

function inferValue(actions: RawSyliusPromotionAction[] | undefined): number | undefined {
  if (!actions || actions.length === 0) return undefined
  const first = actions[0]
  if (!first?.configuration) return undefined
  const config = first.configuration
  // Percentage: { percentage: 0.1 } -> 10
  if (config['percentage'] != null) {
    return Number(config['percentage']) * 100
  }
  // Fixed amount: { amount: 1000 } (cents) or { CHANNEL: { amount: 1000 } }.
  // Sylius amounts are integer minor units (cents) — already canonical.
  if (config['amount'] != null) {
    return Math.round(Number(config['amount']))
  }
  // Channel-specific config
  const channelKeys = Object.keys(config)
  if (channelKeys.length > 0) {
    const firstChannel = config[channelKeys[0]!] as Record<string, unknown> | undefined
    if (firstChannel?.['amount'] != null) {
      return Math.round(Number(firstChannel['amount']))
    }
    if (firstChannel?.['percentage'] != null) {
      return Number(firstChannel['percentage']) * 100
    }
  }
  return undefined
}

function inferAppliesTo(
  actions: RawSyliusPromotionAction[] | undefined,
): DiscountAppliesTo | undefined {
  if (!actions || actions.length === 0) return 'ORDER'
  const first = actions[0]
  if (!first?.type) return 'ORDER'
  if (first.type.includes('shipping')) return 'SHIPPING'
  if (first.type.includes('unit')) return 'PRODUCTS'
  return 'ORDER'
}

export function transformDiscount(raw: RawSyliusPromotion): Discount {
  const couponCode = raw.coupons?.[0]?.code
  return {
    id: String(raw.id),
    code: couponCode ?? raw.code,
    title: raw.name ?? raw.code,
    type: inferType(raw.actions),
    value: inferValue(raw.actions),
    appliesTo: inferAppliesTo(raw.actions),
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.used,
    startsAt: raw.startsAt ?? undefined,
    endsAt: raw.endsAt ?? undefined,
    createdAt: raw.createdAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    code: discount.code ?? discount.id,
    name: discount.title ?? discount.code ?? 'Discount',
    description: discount.title,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    usageLimit: discount.usageLimit,
  }
}
