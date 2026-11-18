/**
 * Big Cartel Discount → canonical Discount.
 *
 * Big Cartel discounts are promotional codes that can apply percentage off,
 * flat-rate off, or free shipping. They map cleanly to the canonical Discount
 * shape.
 *
 * reward_type values: 'percent_discount' | 'flat_rate_discount' | 'free_shipping'
 * application_type values: 'all' | 'category' | 'product'
 *
 * Amounts (percent_discount, flat_rate_discount, minimum_cart_total) are
 * returned as decimal major-unit floats; flat_rate_discount is converted to
 * minor units via majorToMinor.
 *
 * Docs: https://developers.bigcartel.com/api/v1#discounts
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Big Cartel shape ───────────────────────────────────────────────────

export interface RawBigCartelDiscount {
  id: string | number
  type?: string
  attributes?: {
    name?: string | null
    code?: string | null
    active_at?: string | null
    expires_at?: string | null
    reward_type?: string | null
    application_type?: string | null
    percent_discount?: number | string | null
    flat_rate_discount?: number | string | null
    use_limit?: number | null
    use_count?: number | null
    minimum_cart_total?: number | string | null
    minimum_cart_quantity?: number | null
    automatic?: boolean | null
    single_use_per_email?: boolean | null
    internal_note?: string | null
    includes_free_shipping?: boolean | null
    shipping_region?: string | null
  }
  relationships?: {
    products?: { data?: Array<{ id: string | number }> }
    categories?: { data?: Array<{ id: string | number }> }
  }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRewardType(rewardType: string | null | undefined): DiscountType | undefined {
  if (!rewardType) return undefined
  switch (rewardType.toLowerCase()) {
    case 'percent_discount':
      return 'PERCENTAGE'
    case 'flat_rate_discount':
      return 'FIXED_AMOUNT'
    case 'free_shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapApplicationType(
  applicationType: string | null | undefined,
): DiscountAppliesTo | undefined {
  if (!applicationType) return undefined
  switch (applicationType.toLowerCase()) {
    case 'all':
      return 'ORDER'
    case 'product':
      return 'PRODUCTS'
    case 'category':
      return 'PRODUCTS'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawBigCartelDiscount): Discount {
  const attrs = raw.attributes ?? {}
  const rewardType = attrs.reward_type ?? undefined
  const type = mapRewardType(rewardType)

  // Value: for PERCENTAGE use raw percent; for FIXED_AMOUNT convert to minor units
  let value: number | undefined
  if (rewardType === 'percent_discount' && attrs.percent_discount != null) {
    value = toNum(attrs.percent_discount)
  } else if (rewardType === 'flat_rate_discount' && attrs.flat_rate_discount != null) {
    // Store as minor units (cents) consistent with canonical Money convention
    value = majorToMinor(toNum(attrs.flat_rate_discount))
  }

  const productIds =
    raw.relationships?.products?.data?.map((p) => String(p.id)) ?? []
  const collectionIds =
    raw.relationships?.categories?.data?.map((c) => String(c.id)) ?? []

  const minPurchase =
    attrs.minimum_cart_total != null
      ? {
          amount: majorToMinor(toNum(attrs.minimum_cart_total)),
          currency: 'USD' as const,
        }
      : undefined

  return {
    id: String(raw.id),
    code: attrs.code ?? undefined,
    title: attrs.name ?? undefined,
    type,
    value,
    appliesTo: mapApplicationType(attrs.application_type),
    productIds: productIds.length > 0 ? productIds : undefined,
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    minimumPurchaseAmount: minPurchase,
    usageLimit: attrs.use_limit ?? undefined,
    usageCount: attrs.use_count ?? undefined,
    startsAt: attrs.active_at ?? undefined,
    endsAt: attrs.expires_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (discount.code != null) attributes['code'] = discount.code
  if (discount.title != null) attributes['name'] = discount.title
  if (discount.usageLimit != null) attributes['use_limit'] = discount.usageLimit
  if (discount.startsAt != null) attributes['active_at'] = discount.startsAt
  if (discount.endsAt != null) attributes['expires_at'] = discount.endsAt
  return { data: { type: 'discounts', attributes } }
}
