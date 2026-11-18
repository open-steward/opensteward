/**
 * eBay Marketing API Promotion → canonical Discount.
 *
 * eBay's Sell Marketing API surfaces seller promotions (now called discounts
 * in Seller Hub as of July 2024; API interface unchanged) at:
 *   GET /sell/marketing/v1/promotion               → paginated list (PromotionDetail objects)
 *   GET /sell/marketing/v1/item_promotion/{id}     → single ItemPromotion (includes discountRules)
 *   POST /sell/marketing/v1/item_promotion         → create
 *   PUT  /sell/marketing/v1/item_promotion/{id}    → update
 *   DELETE /sell/marketing/v1/item_promotion/{id}  → delete
 *
 * Two promotion sub-types exist:
 *   - item_promotion (threshold discounts: ORDER_DISCOUNT, VOLUME_DISCOUNT, CODED_COUPON)
 *   - item_price_markdown (MARKDOWN_SALE — sale price on specific listings)
 *
 * The list endpoint returns lightweight PromotionDetail; the get endpoint returns
 * the full ItemPromotion shape. We map both to the canonical Discount type.
 *
 * Docs: https://developer.ebay.com/api-docs/sell/marketing/overview.html
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

/** Monetary amount as returned by eBay APIs. */
export interface RawEbayPromotionMoney {
  value: string
  currency: string
}

/**
 * DiscountBenefit — nested inside a discountRule. Exactly one of the four
 * fields is present per rule.
 * Docs: https://developer.ebay.com/api-docs/sell/marketing/types/sme:DiscountBenefit
 */
export interface RawEbayDiscountBenefit {
  /** Monetary amount off an item. */
  amountOffItem?: RawEbayPromotionMoney
  /** Monetary amount off the whole order. */
  amountOffOrder?: RawEbayPromotionMoney
  /** Percentage off an item (e.g. "10" = 10%). */
  percentageOffItem?: string
  /** Percentage off the whole order. */
  percentageOffOrder?: string
  [key: string]: unknown
}

/** One discount rule (threshold discount). */
export interface RawEbayDiscountRule {
  discountBenefit?: RawEbayDiscountBenefit
  ruleOrder?: number
  [key: string]: unknown
}

/**
 * Full ItemPromotion returned by GET /sell/marketing/v1/item_promotion/{id}.
 * Also used as the POST/PUT request body shape.
 */
export interface RawEbayItemPromotion {
  promotionId?: string
  name?: string
  promotionStatus?: string
  promotionType?: string
  startDate?: string
  endDate?: string
  /** CODED_COUPON type: the coupon code buyers enter at checkout. */
  couponCode?: string
  discountRules?: RawEbayDiscountRule[]
  marketplaceId?: string
  description?: string
  [key: string]: unknown
}

/**
 * Lightweight PromotionDetail returned by GET /sell/marketing/v1/promotion
 * (the list endpoint). Sufficient to build a canonical Discount.
 */
export interface RawEbayPromotionDetail {
  promotionId?: string
  promotionName?: string
  promotionType?: string
  promotionStatus?: string
  startDate?: string
  endDate?: string
  promotionHref?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map eBay promotionType → canonical DiscountType.
 * eBay types: CODED_COUPON, MARKDOWN_SALE, ORDER_DISCOUNT, VOLUME_DISCOUNT
 */
function mapPromotionType(type: string | undefined): DiscountType | undefined {
  if (!type) return undefined
  switch (type) {
    case 'CODED_COUPON':
      return 'PERCENTAGE' // coupon can be % or fixed; we refine below per benefit
    case 'MARKDOWN_SALE':
      return 'PERCENTAGE' // markdown = percentage off
    case 'ORDER_DISCOUNT':
      return 'PERCENTAGE' // order discount can be % or fixed; refined below
    case 'VOLUME_DISCOUNT':
      return 'PERCENTAGE' // volume discount = % off
    default:
      return undefined
  }
}

/**
 * Extract discount type and value from the first discountRule's benefit.
 * Returns { type, value, currency } or {} when no rule is present.
 */
function extractBenefit(rules: RawEbayDiscountRule[] | undefined): {
  type?: DiscountType
  value?: number
  currency?: string
} {
  const benefit = rules?.[0]?.discountBenefit
  if (!benefit) return {}

  if (benefit.percentageOffItem != null) {
    return { type: 'PERCENTAGE', value: parseFloat(benefit.percentageOffItem) }
  }
  if (benefit.percentageOffOrder != null) {
    return { type: 'PERCENTAGE', value: parseFloat(benefit.percentageOffOrder) }
  }
  if (benefit.amountOffItem != null) {
    const n = parseFloat(benefit.amountOffItem.value)
    return {
      type: 'FIXED_AMOUNT',
      value: Number.isFinite(n) ? majorToMinor(n, benefit.amountOffItem.currency) : undefined,
      currency: benefit.amountOffItem.currency,
    }
  }
  if (benefit.amountOffOrder != null) {
    const n = parseFloat(benefit.amountOffOrder.value)
    return {
      type: 'FIXED_AMOUNT',
      value: Number.isFinite(n) ? majorToMinor(n, benefit.amountOffOrder.currency) : undefined,
      currency: benefit.amountOffOrder.currency,
    }
  }
  return {}
}

// ── Transform: ItemPromotion (full get response) ──────────────────────────────

export function transformItemPromotion(raw: RawEbayItemPromotion): Discount {
  const benefit = extractBenefit(raw.discountRules)

  return {
    id: raw.promotionId ?? '',
    code: raw.couponCode,
    title: raw.name,
    type: benefit.type ?? mapPromotionType(raw.promotionType),
    value: benefit.value,
    currency: benefit.currency,
    appliesTo: raw.promotionType === 'MARKDOWN_SALE' ? 'PRODUCTS' : 'ORDER',
    startsAt: raw.startDate,
    endsAt: raw.endDate,
    createdAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform: PromotionDetail (list response) ────────────────────────────────

export function transformPromotionDetail(raw: RawEbayPromotionDetail): Discount {
  return {
    id: raw.promotionId ?? '',
    title: raw.promotionName,
    type: mapPromotionType(raw.promotionType),
    appliesTo: raw.promotionType === 'MARKDOWN_SALE' ? 'PRODUCTS' : 'ORDER',
    startsAt: raw.startDate,
    endsAt: raw.endDate,
    createdAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
