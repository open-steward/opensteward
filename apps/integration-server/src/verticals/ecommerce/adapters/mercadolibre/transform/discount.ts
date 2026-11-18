/**
 * Mercado Libre Seller Promotion → canonical Discount.
 *
 * Mercado Libre exposes seller promotions via:
 *   GET /seller-promotions/users/{userId}?app_version=v2  → list all promotions
 *   GET /seller-promotions/promotions/{promotionId}       → get single promotion
 *
 * Response structure (per ML docs):
 *   {
 *     id: string,                  // e.g. "C-MLA12345"
 *     type: string,                // "DEAL", "PRICE_DISCOUNT", "SELLER_CAMPAIGN", etc.
 *     name: string,
 *     sub_type?: string,           // e.g. "FLEXIBLE_PERCENTAGE"
 *     status: string,              // "started", "finished", "paused", "scheduled"
 *     start_date: string,
 *     finish_date?: string,
 *     allow_combination?: boolean
 *   }
 *
 * Canonical `Discount.id` = ML promotion id.
 * Canonical `Discount.type` is mapped from ML type.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliPromotion {
  id: string
  type?: string
  name?: string
  sub_type?: string | null
  status?: string
  start_date?: string
  finish_date?: string | null
  allow_combination?: boolean
  [key: string]: unknown
}

export interface RawMeliPromotionListEnvelope {
  results?: RawMeliPromotion[]
  paging?: {
    total?: number
    offset?: number
    limit?: number
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map ML promotion type to canonical DiscountType.
 * ML types: DEAL, PRICE_DISCOUNT, DOD, LIGHTNING, MARKETPLACE_CAMPAIGN,
 *           PRE_NEGOTIATED, SELLER_CAMPAIGN, VOLUME, UNHEALTHY_STOCK, etc.
 */
function mapDiscountType(type: string | undefined): DiscountType | undefined {
  if (!type) return undefined
  switch (type.toUpperCase()) {
    case 'PRICE_DISCOUNT':
    case 'DEAL':
    case 'DOD':
    case 'LIGHTNING':
    case 'SELLER_CAMPAIGN':
    case 'MARKETPLACE_CAMPAIGN':
    case 'PRE_NEGOTIATED':
    case 'UNHEALTHY_STOCK':
      return 'PERCENTAGE'
    case 'VOLUME':
      return 'PERCENTAGE'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawMeliPromotion): Discount {
  return {
    id: raw.id,
    code: undefined,       // ML promotions are not code-based — they apply to items
    title: raw.name ?? undefined,
    type: mapDiscountType(raw.type),
    value: undefined,      // Discount value lives on promotion items, not on the promotion itself
    currency: undefined,
    appliesTo: 'PRODUCTS',
    productIds: undefined,
    collectionIds: undefined,
    minimumPurchaseAmount: undefined,
    usageLimit: undefined,
    usageCount: undefined,
    customerEligibility: 'ALL',
    startsAt: toIsoDatetime(raw.start_date),
    endsAt: raw.finish_date ? toIsoDatetime(raw.finish_date) : undefined,
    createdAt: toIsoDatetime(raw.start_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
