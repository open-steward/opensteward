/**
 * CS-Cart Promotion → canonical Discount.
 *
 * CS-Cart models discounts as "promotions" (GET /api/promotions). Each promotion
 * can have multiple conditions and bonuses; the primary bonus type determines the
 * canonical discount type. The simplest case is a percentage or fixed discount
 * applied to an order or specific products.
 *
 * Relevant API fields:
 *   promotion_id  — stable ID
 *   name          — display name
 *   coupon_code   — optional coupon code (code-based promotion)
 *   status        — 'A' = active, 'D' = disabled
 *   conditions    — array of condition objects
 *   bonuses       — array of bonus objects
 *   from_date     — Unix timestamp (start)
 *   to_date       — Unix timestamp (end), 0 = no end
 *   max_uses      — 0 = unlimited
 *   uses          — number of times used
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface CsCartPromotionConditionOrBonus {
  condition?: string
  bonus?: string
  value?: string | number
  [key: string]: unknown
}

export interface CsCartPromotion {
  promotion_id: number | string
  name?: string
  coupon_code?: string | null
  status?: string
  conditions?: CsCartPromotionConditionOrBonus[]
  bonuses?: CsCartPromotionConditionOrBonus[]
  from_date?: number | string | null
  to_date?: number | string | null
  max_uses?: number | string | null
  uses?: number | string | null
  [key: string]: unknown
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

function mapDiscountType(
  bonuses: CsCartPromotionConditionOrBonus[] | undefined,
): { type: DiscountType | undefined; value: number | undefined } {
  if (!bonuses?.length) return { type: undefined, value: undefined }
  const first = bonuses[0]
  const bonusKey = (first?.bonus ?? '').toString().toLowerCase()
  const val = first?.value != null ? Number(first.value) : undefined

  if (bonusKey.includes('percent')) {
    return { type: 'PERCENTAGE', value: val }
  }
  if (bonusKey.includes('fixed') || bonusKey.includes('amount')) {
    return { type: 'FIXED_AMOUNT', value: val }
  }
  if (bonusKey.includes('ship') || bonusKey.includes('free_ship')) {
    return { type: 'FREE_SHIPPING', value: val }
  }
  return { type: undefined, value: val }
}

export function transformDiscount(raw: CsCartPromotion): Discount {
  const { type, value } = mapDiscountType(raw.bonuses)
  const maxUses = raw.max_uses != null ? Number(raw.max_uses) : undefined
  const usageCount = raw.uses != null ? Number(raw.uses) : undefined
  const endsAt = tsToIso(raw.to_date)

  return {
    id: String(raw.promotion_id),
    code: raw.coupon_code ?? undefined,
    title: raw.name ?? undefined,
    type,
    value,
    appliesTo: 'ORDER',
    usageLimit: maxUses && maxUses > 0 ? maxUses : undefined,
    usageCount: usageCount && usageCount > 0 ? usageCount : undefined,
    customerEligibility: 'ALL',
    startsAt: tsToIso(raw.from_date),
    endsAt: endsAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const bonus: Record<string, unknown> = {}
  if (discount.type === 'PERCENTAGE') {
    bonus['bonus'] = 'percent'
    bonus['value'] = discount.value
  } else if (discount.type === 'FIXED_AMOUNT') {
    bonus['bonus'] = 'fixed_amount'
    bonus['value'] = discount.value
  } else if (discount.type === 'FREE_SHIPPING') {
    bonus['bonus'] = 'free_shipping'
    bonus['value'] = 0
  }

  return {
    name: discount.title,
    coupon_code: discount.code ?? null,
    status: 'A',
    bonuses: Object.keys(bonus).length ? [bonus] : [],
    conditions: [],
    from_date: discount.startsAt ? Math.floor(new Date(discount.startsAt).getTime() / 1000) : 0,
    to_date: discount.endsAt ? Math.floor(new Date(discount.endsAt).getTime() / 1000) : 0,
    max_uses: discount.usageLimit ?? 0,
  }
}
