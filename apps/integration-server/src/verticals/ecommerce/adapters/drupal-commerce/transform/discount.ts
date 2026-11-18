/**
 * Drupal Commerce Promotion → canonical Discount.
 *
 * Drupal Commerce ships a `commerce_promotion` entity type (the Promotion
 * sub-module). It maps 1:1 to the canonical Discount resource.
 *
 * JSON:API path: `/jsonapi/commerce_promotion/default`
 *
 * `commerce_promotion--default` attributes:
 *   - `name`                  — internal admin name
 *   - `display_name`          — customer-facing label (optional)
 *   - `status`                — boolean enabled/disabled
 *   - `start_date`            — ISO-8601 datetime string
 *   - `end_date`              — ISO-8601 datetime string (optional)
 *   - `usage_limit`           — integer (0 = unlimited)
 *   - `usage_limit_customer`  — per-customer integer (0 = unlimited)
 *   - `offer`                 — commerce_plugin_item describing type + config
 *   - `conditions`            — array of condition plugin items
 *   - `condition_operator`    — "AND" | "OR"
 *   - `compatibility`         — "ANY" | "NONE"
 *   - `weight`                — integer sort priority
 *
 * Relationships:
 *   - `coupons`               — commerce_promotion_coupon entities
 *   - `stores`                — commerce_store entities
 *   - `order_types`           — commerce_order_type entities
 *
 * Coupon code: a single linked coupon's `code` attribute is included when the
 * promotion has exactly one coupon and the caller includes `?include=coupons`.
 * At list level we omit the include and leave `code` undefined.
 *
 * Offer type mapping (canonical type is derived from the offer plugin target_plugin_id):
 *   order_percentage_off → PERCENTAGE
 *   order_fixed_amount_off → FIXED_AMOUNT
 *   product_percentage_off → PERCENTAGE
 *   product_fixed_amount_off → FIXED_AMOUNT
 *   shipping_percentage_off → FREE_SHIPPING (closest match)
 *   free_shipping → FREE_SHIPPING
 *   buy_x_get_y → BUY_X_GET_Y
 *   (everything else) → PERCENTAGE (safe default for unknown offer plugins)
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import type { JsonApiResource } from '../client'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalOfferPlugin {
  target_plugin_id?: string
  target_plugin_configuration?: {
    percentage?: string | number
    amount?: { number?: string; currency_code?: string }
    [key: string]: unknown
  }
}

export interface DrupalPromotionAttributes {
  name?: string
  display_name?: string | null
  status?: boolean | number
  start_date?: string | null
  end_date?: string | null
  usage_limit?: number
  usage_limit_customer?: number
  offer?: DrupalOfferPlugin | null
  condition_operator?: 'AND' | 'OR'
  compatibility?: string
  weight?: number
  [key: string]: unknown
}

export type DrupalPromotion = JsonApiResource & {
  attributes: DrupalPromotionAttributes
}

// Coupon entities may be sideloaded via ?include=coupons
export interface DrupalCouponAttributes {
  code?: string
  usage_limit?: number
  usage_count?: number
  [key: string]: unknown
}

export type DrupalCoupon = JsonApiResource & {
  attributes: DrupalCouponAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapOfferType(pluginId: string | undefined): DiscountType | undefined {
  if (!pluginId) return undefined
  if (pluginId.includes('percentage')) return 'PERCENTAGE'
  if (pluginId.includes('fixed_amount')) return 'FIXED_AMOUNT'
  if (pluginId === 'free_shipping' || pluginId.includes('shipping')) return 'FREE_SHIPPING'
  if (pluginId.includes('buy_x_get_y') || pluginId.includes('bxgy')) return 'BUY_X_GET_Y'
  return 'PERCENTAGE'
}

function extractOfferValue(
  offer: DrupalOfferPlugin | null | undefined,
): { value: number | undefined; currency: string | undefined } {
  if (!offer?.target_plugin_configuration) return { value: undefined, currency: undefined }
  const cfg = offer.target_plugin_configuration

  // Percentage offers
  if (cfg['percentage'] != null) {
    const pct = typeof cfg['percentage'] === 'string'
      ? parseFloat(cfg['percentage'])
      : (cfg['percentage'] as number)
    return { value: Number.isFinite(pct) ? pct * 100 : undefined, currency: undefined }
  }

  // Fixed-amount offers
  if (cfg['amount'] != null) {
    const amt = cfg['amount'] as { number?: string; currency_code?: string }
    const major = amt.number != null ? parseFloat(amt.number) : NaN
    const currency = amt.currency_code ?? 'USD'
    return {
      value: Number.isFinite(major) ? majorToMinor(major, currency) : undefined,
      currency,
    }
  }

  return { value: undefined, currency: undefined }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(
  raw: DrupalPromotion,
  includedCoupons?: DrupalCoupon[],
): Discount {
  const attrs = raw.attributes

  // Use the first included coupon code if available
  const firstCoupon = includedCoupons?.[0]
  const code = firstCoupon?.attributes.code ?? undefined

  const offerType = mapOfferType(attrs.offer?.target_plugin_id)
  const { value, currency } = extractOfferValue(attrs.offer)

  // Usage: promotion-level usage_limit is on the entity; coupon usage on coupon entities
  const usageLimit = typeof attrs.usage_limit === 'number' && attrs.usage_limit > 0
    ? attrs.usage_limit
    : undefined
  const usageCount = typeof firstCoupon?.attributes.usage_count === 'number'
    ? firstCoupon.attributes.usage_count
    : undefined

  const title = attrs.display_name ?? attrs.name ?? undefined

  return {
    id: raw.id,
    code,
    title,
    type: offerType,
    value,
    currency,
    appliesTo: 'ORDER',
    usageLimit,
    usageCount,
    customerEligibility: 'ALL',
    startsAt: attrs.start_date ?? undefined,
    endsAt: attrs.end_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
