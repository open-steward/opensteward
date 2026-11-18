/**
 * BigCommerce Promotion → canonical Discount.
 *
 * BigCommerce uses the Promotions API (`/v3/promotions`). Also has
 * `/v2/coupons` for code-based discounts, but the promotions API is the
 * primary modern endpoint.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

export interface RawBigCommercePromotionRule {
  action?: {
    gift_item?: unknown
    cart_value?: { discount?: { percentage_amount?: string | number; fixed_amount?: string | number } }
  }
  condition?: {
    cart?: { minimum_spend?: string | number; items?: { product_ids?: number[] } }
  }
}

export interface RawBigCommerceCoupon {
  id?: number | string
  code?: string
  num_uses?: number
}

export interface RawBigCommercePromotion {
  id: number | string
  name?: string
  status?: string // 'enabled' | 'disabled'
  rules?: RawBigCommercePromotionRule[]
  channels?: number[]
  current_uses?: number
  max_uses?: number
  start_date?: string
  end_date?: string
  date_created?: string
  coupon_code?: string
  [key: string]: unknown
}

function mapType(promo: RawBigCommercePromotion): DiscountType | undefined {
  const action = promo.rules?.[0]?.action
  if (!action) return undefined
  const discount = action.cart_value?.discount
  if (discount?.percentage_amount) return 'PERCENTAGE'
  if (discount?.fixed_amount) return 'FIXED_AMOUNT'
  if (action.gift_item) return 'FIXED_AMOUNT'
  return undefined
}

function mapValue(promo: RawBigCommercePromotion): number {
  const discount = promo.rules?.[0]?.action?.cart_value?.discount
  if (!discount) return 0
  if (discount.percentage_amount) {
    return typeof discount.percentage_amount === 'string'
      ? parseFloat(discount.percentage_amount)
      : discount.percentage_amount
  }
  if (discount.fixed_amount) {
    return typeof discount.fixed_amount === 'string'
      ? parseFloat(discount.fixed_amount)
      : discount.fixed_amount
  }
  return 0
}

function mapAppliesTo(promo: RawBigCommercePromotion): DiscountAppliesTo | undefined {
  const condition = promo.rules?.[0]?.condition
  if (condition?.cart?.items?.product_ids && condition.cart.items.product_ids.length > 0) {
    return 'PRODUCTS'
  }
  return 'ORDER'
}

export function transformDiscount(
  promo: RawBigCommercePromotion,
  coupon?: RawBigCommerceCoupon,
): Discount {
  const condition = promo.rules?.[0]?.condition
  const minSpend = condition?.cart?.minimum_spend
  const minAmount = minSpend != null
    ? typeof minSpend === 'string' ? parseFloat(minSpend) : minSpend
    : undefined
  const productIds = condition?.cart?.items?.product_ids?.map((p) => String(p))

  return {
    id: String(promo.id),
    code: coupon?.code ?? promo.coupon_code,
    title: promo.name,
    type: mapType(promo),
    value: mapValue(promo),
    appliesTo: mapAppliesTo(promo),
    productIds: productIds && productIds.length > 0 ? productIds : undefined,
    minimumPurchaseAmount:
      minAmount != null && minAmount > 0
        ? { amount: majorToMinor(minAmount, 'USD'), currency: 'USD' }
        : undefined,
    usageLimit: promo.max_uses ?? undefined,
    usageCount: coupon?.num_uses ?? promo.current_uses,
    customerEligibility: 'ALL' as DiscountCustomerEligibility,
    startsAt: promo.start_date ?? undefined,
    endsAt: promo.end_date ?? undefined,
    createdAt: promo.date_created,
    metadata: { promo, coupon } as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const discountValue: Record<string, unknown> = {}
  if (discount.type === 'PERCENTAGE') {
    discountValue.percentage_amount = discount.value?.toString()
  } else {
    discountValue.fixed_amount = discount.value?.toString()
  }

  return {
    name: discount.title,
    rules: [
      {
        action: { cart_value: { discount: discountValue } },
        condition: {
          cart: {
            minimum_spend:
              discount.minimumPurchaseAmount?.amount != null
                ? (discount.minimumPurchaseAmount.amount / 100).toString()
                : undefined,
            items: discount.productIds
              ? { product_ids: discount.productIds.map(Number) }
              : undefined,
          },
        },
      },
    ],
    max_uses: discount.usageLimit,
    start_date: discount.startsAt,
    end_date: discount.endsAt,
  }
}
