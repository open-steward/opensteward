/**
 * MyCashflow Campaign → canonical Discount.
 *
 * MyCashflow calls discounts "campaigns" and exposes them under the v0 API:
 *   GET /v0/campaigns
 *
 * A campaign contains:
 *  - `id`, `created_at`, `updated_at`
 *  - `published` boolean
 *  - `conditions` — promo codes, customer groups, time constraints
 *  - `discounts` — discount configuration (percentage, fixed amount,
 *                  free shipping rows, affected products)
 *
 * Because the campaign schema nests the discount value inside `discounts`,
 * this transform inspects both levels to build the canonical Discount shape.
 *
 * Docs: https://support.mycashflow.com/api/15-campaigns/
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

// ── Raw MyCashflow shapes ────────────────────────────────────────────────────

export interface RawMyCashflowCampaignPromoCode {
  code?: string | null
  use_limit?: number | null
  used_count?: number | null
  [key: string]: unknown
}

export interface RawMyCashflowCampaignConditions {
  starts_at?: string | null
  ends_at?: string | null
  promo_codes?: RawMyCashflowCampaignPromoCode[]
  minimum_cart_amount?: number | null
  [key: string]: unknown
}

export interface RawMyCashflowCampaignDiscount {
  /**
   * Discount type — common values:
   *  "percentage"   → PERCENTAGE
   *  "fixed_amount" → FIXED_AMOUNT
   *  "free_shipping"→ FREE_SHIPPING
   */
  type?: string | null
  value?: number | null
  currency?: string | null
  /** Product ids this discount applies to (empty = all products). */
  product_ids?: Array<number | string>
  /** Category ids this discount applies to. */
  category_ids?: Array<number | string>
  [key: string]: unknown
}

export interface RawMyCashflowCampaign {
  id: number | string
  published?: boolean | null
  conditions?: RawMyCashflowCampaignConditions | null
  discounts?: RawMyCashflowCampaignDiscount | null
  translations?: Array<{ language: string; title?: string; [k: string]: unknown }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(raw: RawMyCashflowCampaignDiscount | null | undefined): DiscountType | undefined {
  if (!raw?.type) return undefined
  switch (raw.type.toLowerCase()) {
    case 'percentage':
    case 'percent':
      return 'PERCENTAGE'
    case 'fixed_amount':
    case 'fixed':
      return 'FIXED_AMOUNT'
    case 'free_shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(
  raw: RawMyCashflowCampaignDiscount | null | undefined,
): DiscountAppliesTo | undefined {
  if (!raw) return undefined
  if (raw.type?.toLowerCase() === 'free_shipping') return 'SHIPPING'
  if (raw.product_ids && raw.product_ids.length > 0) return 'PRODUCTS'
  if (raw.category_ids && raw.category_ids.length > 0) return 'PRODUCTS'
  return 'ORDER'
}

export function transformDiscount(raw: RawMyCashflowCampaign): Discount {
  const d = raw.discounts
  const c = raw.conditions
  const type = mapType(d)
  const currency = d?.currency ?? 'EUR'

  // FIXED_AMOUNT values are decimal major units → convert to minor units.
  // PERCENTAGE values are kept as-is.
  const rawValue = d?.value ?? 0
  const value =
    type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, currency) : rawValue

  const promoCode = c?.promo_codes?.[0]

  // Prefer the primary language (fi) title, then fall back to any translation.
  const title =
    raw.translations?.find((t) => t.language === 'fi')?.title ??
    raw.translations?.[0]?.title ??
    undefined

  const minimumAmount = c?.minimum_cart_amount
  const usageLimit = promoCode?.use_limit ?? undefined
  const usageCount = promoCode?.used_count ?? undefined

  return {
    id: String(raw.id),
    code: promoCode?.code ?? undefined,
    title,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: mapAppliesTo(d),
    productIds: d?.product_ids?.map((p) => String(p)),
    collectionIds: d?.category_ids?.map((c) => String(c)),
    minimumPurchaseAmount:
      minimumAmount != null && minimumAmount > 0
        ? { amount: majorToMinor(minimumAmount, currency), currency }
        : undefined,
    usageLimit,
    usageCount,
    startsAt: c?.starts_at ?? undefined,
    endsAt: c?.ends_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
