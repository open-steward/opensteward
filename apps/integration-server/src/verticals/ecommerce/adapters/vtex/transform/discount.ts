/**
 * VTEX Promotions & Taxes coupon → canonical Discount.
 *
 * VTEX exposes two discount surfaces:
 *  1. Coupons — GET /api/rnb/pvt/coupon (a coupon code consumers enter at checkout)
 *  2. Promotions — GET /api/rnb/pvt/benefits/calculatorconfiguration (rule-based)
 *
 * This transform covers the coupon endpoint which is the closest analogue to
 * the canonical Discount. Promotions are complex rule trees and are exposed
 * only via the metadata field for callers that need full fidelity.
 *
 * VTEX coupon fields:
 *  - `couponCode`       — the discount code.
 *  - `maxUsage`         — usage cap (null = unlimited).
 *  - `maxUsagePerClient`— per-customer cap.
 *  - `expirationDate`   — ISO 8601 expiry.
 *  - `isArchived`       — whether the coupon is retired.
 *
 * VTEX coupons are code-only containers; the discount value/type lives on the
 * linked promotion, which is not accessible from the coupon endpoint. We set
 * `type` and `value` to undefined and expose the full raw shape via metadata.
 *
 * Docs: https://developers.vtex.com/docs/api-reference/promotions-and-taxes-api
 */

import type { Discount } from '../../../schema/discount'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexCoupon {
  couponCode: string
  utmSource?: string | null
  utmCampaign?: string | null
  maxUsage?: number | null
  maxUsagePerClient?: number | null
  expirationInteractionLimit?: string | null
  lastModified?: string | null
  isArchived?: boolean
  createdIn?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawVtexCoupon): Discount {
  return {
    // VTEX coupons don't have a numeric id — use the code as the stable id.
    id: raw.couponCode,
    code: raw.couponCode,
    title: raw.couponCode,
    // Type and value live on the linked promotion, not on the coupon itself.
    type: undefined,
    value: undefined,
    appliesTo: undefined,
    usageLimit: raw.maxUsage ?? undefined,
    endsAt: raw.expirationInteractionLimit ?? undefined,
    createdAt: raw.createdIn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    couponCode: discount.code,
    maxUsage: discount.usageLimit ?? null,
    expirationInteractionLimit: discount.endsAt ?? null,
  }
}
