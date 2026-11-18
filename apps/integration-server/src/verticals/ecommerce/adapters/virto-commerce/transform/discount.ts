/**
 * Virto Commerce Promotion (+ Coupon) → canonical Discount.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Marketing/swagger.json` →
 * `components.schemas.Promotion` / `Coupon`. A promotion's actual discount
 * math lives in a `dynamicExpression` rule tree, not a simple type+value
 * pair, so canonical `type`/`value`/`appliesTo` are left unmapped — see the
 * matching test file header.
 */
import type { Discount } from '../../../schema/discount'

export interface RawVirtoPromotion {
  id: string
  name?: string
  description?: string
  isActive?: boolean
  maxUsageCount?: number
  startDate?: string
  endDate?: string
  hasCoupons?: boolean
  createdDate?: string
  [key: string]: unknown
}

export interface RawVirtoCoupon {
  id: string
  code?: string
  promotionId?: string
  maxUsesNumber?: number
  totalUsesCount?: number
  expirationDate?: string
  [key: string]: unknown
}

export function transformDiscount(promotion: RawVirtoPromotion, coupon?: RawVirtoCoupon): Discount {
  return {
    id: promotion.id,
    code: coupon?.code,
    title: promotion.name,
    usageLimit: coupon?.maxUsesNumber ?? promotion.maxUsageCount,
    usageCount: coupon?.totalUsesCount,
    startsAt: promotion.startDate,
    endsAt: coupon?.expirationDate ?? promotion.endDate,
    createdAt: promotion.createdDate,
    metadata: { promotion: { ...promotion }, coupon: coupon ? { ...coupon } : undefined },
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body['name'] = discount.title
  if (discount.usageLimit != null) body['maxUsageCount'] = discount.usageLimit
  if (discount.startsAt != null) body['startDate'] = discount.startsAt
  if (discount.endsAt != null) body['endDate'] = discount.endsAt
  return body
}
