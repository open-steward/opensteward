/**
 * Shopware B2B Suite Promotion → canonical Discount.
 *
 * Identical to base Shopware 6 — B2B Suite does not modify promotions.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawShopwarePromotionDiscount {
  id?: string
  scope?: string
  type?: string
  value?: number
  considerAdvancedRules?: boolean
  [key: string]: unknown
}

export interface RawShopwarePromotion {
  id: string
  name?: string
  code?: string | null
  active?: boolean
  validFrom?: string | null
  validUntil?: string | null
  maxRedemptionsGlobal?: number | null
  maxRedemptionsPerCustomer?: number | null
  orderCount?: number
  useCodes?: boolean
  useIndividualCodes?: boolean
  discounts?: RawShopwarePromotionDiscount[]
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapType(discount: RawShopwarePromotionDiscount | undefined): DiscountType | undefined {
  if (!discount) return undefined
  if (discount.scope === 'delivery') return 'FREE_SHIPPING'
  switch (discount.type) {
    case 'percentage':
      return 'PERCENTAGE'
    case 'absolute':
    case 'fixed':
    case 'fixed_unit':
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

function mapAppliesTo(
  discount: RawShopwarePromotionDiscount | undefined,
): DiscountAppliesTo | undefined {
  if (!discount) return undefined
  switch (discount.scope) {
    case 'cart':
      return 'ORDER'
    case 'delivery':
      return 'SHIPPING'
    case 'set':
    case 'set-group':
      return 'PRODUCTS'
    default:
      return 'ORDER'
  }
}

export function transformDiscount(raw: RawShopwarePromotion): Discount {
  const firstDiscount = raw.discounts?.[0]
  return {
    id: raw.id,
    code: raw.code ?? undefined,
    title: raw.name,
    type: mapType(firstDiscount),
    value: firstDiscount?.value,
    appliesTo: mapAppliesTo(firstDiscount),
    usageLimit: raw.maxRedemptionsGlobal ?? undefined,
    usageCount: raw.orderCount,
    startsAt: raw.validFrom ?? undefined,
    endsAt: raw.validUntil ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  let type: string | undefined
  let scope: string = 'cart'
  switch (discount.type) {
    case 'PERCENTAGE':
      type = 'percentage'
      break
    case 'FIXED_AMOUNT':
      type = 'absolute'
      break
    case 'FREE_SHIPPING':
      type = 'percentage'
      scope = 'delivery'
      break
    default:
      break
  }

  if (discount.appliesTo === 'SHIPPING') scope = 'delivery'
  if (discount.appliesTo === 'PRODUCTS') scope = 'set'

  return {
    name: discount.title ?? discount.code ?? 'Promotion',
    code: discount.code,
    active: true,
    useCodes: !!discount.code,
    validFrom: discount.startsAt,
    validUntil: discount.endsAt,
    maxRedemptionsGlobal: discount.usageLimit,
    discounts: [
      {
        scope,
        type,
        value: discount.value,
      },
    ],
  }
}
