/**
 * Vendure Promotion -> canonical Discount.
 *
 * Vendure Promotions have conditions + actions. The conditions determine
 * when the promotion applies, and the actions determine what discount
 * is given.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'

export interface RawVendurePromotionAction {
  code?: string
  args?: Array<{ name?: string; value?: string }>
}

export interface RawVendurePromotionCondition {
  code?: string
  args?: Array<{ name?: string; value?: string }>
}

export interface RawVendurePromotion {
  id: string
  name?: string | null
  couponCode?: string | null
  enabled?: boolean
  startsAt?: string | null
  endsAt?: string | null
  perCustomerUsageLimit?: number | null
  usageLimit?: number | null
  conditions?: RawVendurePromotionCondition[]
  actions?: RawVendurePromotionAction[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapType(raw: RawVendurePromotion): DiscountType | undefined {
  if (!raw.actions || raw.actions.length === 0) return undefined
  const actionCode = raw.actions[0]?.code ?? ''
  if (actionCode.includes('percentage')) return 'PERCENTAGE'
  if (actionCode.includes('fixed') || actionCode.includes('discount')) return 'FIXED_AMOUNT'
  if (actionCode.includes('free_shipping') || actionCode.includes('shipping')) return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(raw: RawVendurePromotion): DiscountAppliesTo | undefined {
  if (!raw.actions || raw.actions.length === 0) return undefined
  const actionCode = raw.actions[0]?.code ?? ''
  if (actionCode.includes('shipping')) return 'SHIPPING'
  if (actionCode.includes('order')) return 'ORDER'
  return 'PRODUCTS'
}

function extractDiscountValue(raw: RawVendurePromotion): number | undefined {
  if (!raw.actions || raw.actions.length === 0) return undefined
  const args = raw.actions[0]?.args ?? []
  const discountArg = args.find((a) => a.name === 'discount' || a.name === 'amount')
  if (discountArg?.value != null) {
    const parsed = parseFloat(discountArg.value)
    return isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

export function transformDiscount(raw: RawVendurePromotion): Discount {
  return {
    id: String(raw.id),
    code: raw.couponCode ?? undefined,
    title: raw.name ?? undefined,
    type: mapType(raw),
    value: extractDiscountValue(raw),
    appliesTo: mapAppliesTo(raw),
    usageLimit: raw.usageLimit ?? raw.perCustomerUsageLimit ?? undefined,
    startsAt: raw.startsAt ?? undefined,
    endsAt: raw.endsAt ?? undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    name: discount.title,
    couponCode: discount.code,
    enabled: true,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    perCustomerUsageLimit: discount.usageLimit,
  }
}
