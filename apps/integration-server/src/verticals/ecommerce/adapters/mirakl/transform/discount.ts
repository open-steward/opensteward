/**
 * Mirakl Promotion → canonical Discount.
 *
 * Mirakl exposes promotions (seller-configured discounts) via:
 *   GET  /api/promotions  (PR01) — paginated list of promotions
 *   POST /api/promotions         — create a promotion
 *   PUT  /api/promotions/{id}    — update a promotion
 *
 * Promotion types map to canonical DiscountType:
 *   AMOUNT_OFF          → FIXED_AMOUNT
 *   PERCENTAGE_OFF      → PERCENTAGE
 *   REDUCED_UNIT_PRICE  → FIXED_AMOUNT (reduced unit price)
 *   FREE_ITEMS          → BUY_X_GET_Y (closest canonical equivalent)
 *
 * Promotions may optionally have a `promo_code` attached via
 * `application_to_cart[].promo_code`. When present, the first code is
 * mapped to `Discount.code`.
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/promotions/pr01
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Mirakl promotion shapes ───────────────────────────────────────────────

export interface RawMiraklPromotionChannel {
  code?: string | null
  label?: string | null
}

export interface RawMiraklPromotionTrigger {
  type?: string | null
  quantity_purchased?: number | null
  amount_purchased?: number | null
  same_item_purchased?: boolean | null
}

export interface RawMiraklPromotionCartApplication {
  promo_code?: string | null
}

export interface RawMiraklPromotion {
  internal_id?: string | null
  internal_description?: string | null
  type?: string | null
  state?: string | null
  /** Flat amount off (AMOUNT_OFF type). */
  amount_off?: number | null
  /** Percentage off (PERCENTAGE_OFF type). */
  percentage_off?: number | null
  /** Free items quantity (FREE_ITEMS type). */
  free_items_quantity?: number | null
  /** Reduced unit price (REDUCED_UNIT_PRICE type). */
  reduced_unit_price?: number | null
  max_quantity_to_discount?: number | null
  start_date?: string | null
  end_date?: string | null
  date_created?: string | null
  last_updated?: string | null
  channels?: RawMiraklPromotionChannel[] | null
  trigger_offer_ids?: string[] | null
  reward_offer_ids?: string[] | null
  reward_on_purchased_items?: boolean | null
  triggers?: RawMiraklPromotionTrigger[] | null
  application_to_cart?: RawMiraklPromotionCartApplication[] | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(type: string | null | undefined): DiscountType | undefined {
  switch (type) {
    case 'AMOUNT_OFF':
    case 'REDUCED_UNIT_PRICE':
      return 'FIXED_AMOUNT'
    case 'PERCENTAGE_OFF':
      return 'PERCENTAGE'
    case 'FREE_ITEMS':
      return 'BUY_X_GET_Y'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawMiraklPromotion): DiscountAppliesTo | undefined {
  // If trigger or reward offer IDs are specified, it applies to specific products.
  const hasOfferTargets =
    (raw.trigger_offer_ids && raw.trigger_offer_ids.length > 0) ||
    (raw.reward_offer_ids && raw.reward_offer_ids.length > 0)
  if (hasOfferTargets) return 'PRODUCTS'
  return 'ORDER'
}

function pickValue(raw: RawMiraklPromotion): number | undefined {
  if (raw.percentage_off != null) return raw.percentage_off
  if (raw.amount_off != null) return raw.amount_off
  if (raw.reduced_unit_price != null) return raw.reduced_unit_price
  if (raw.free_items_quantity != null) return raw.free_items_quantity
  return undefined
}

export function transformPromotion(raw: RawMiraklPromotion): Discount {
  const promoCode = raw.application_to_cart?.[0]?.promo_code ?? undefined

  const productIds: string[] = []
  if (raw.trigger_offer_ids) productIds.push(...raw.trigger_offer_ids)
  if (raw.reward_offer_ids) productIds.push(...raw.reward_offer_ids)

  return {
    id: String(raw.internal_id ?? ''),
    code: promoCode ?? undefined,
    title: raw.internal_description ?? undefined,
    type: mapType(raw.type),
    value: pickValue(raw),
    appliesTo: mapAppliesTo(raw),
    productIds: productIds.length > 0 ? [...new Set(productIds)] : undefined,
    startsAt: toIsoDatetime(raw.start_date) ?? raw.start_date ?? undefined,
    endsAt: toIsoDatetime(raw.end_date) ?? raw.end_date ?? undefined,
    createdAt: toIsoDatetime(raw.date_created) ?? raw.date_created ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
