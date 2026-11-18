/**
 * Salesforce Commerce Cloud (SCAPI) Promotion → canonical Discount.
 *
 * SCAPI uses "promotions" for the canonical Discount concept.  Promotions are
 * configured in Business Manager and exposed via the Shopper Promotions API.
 *
 * Key field mappings:
 *   - `id`              → canonical `id`
 *   - `name`            → canonical `title`
 *   - `couponBased`     → only coupon-based promotions have a redeemable `code`
 *   - `discount.type`   → maps to canonical `DiscountType`
 *   - `discount.amount` → canonical `value` (decimal %; converted for FIXED)
 *   - `startDate`       → `startsAt`
 *   - `endDate`         → `endsAt`
 *
 * Reference:
 *   GET /pricing/shopper-promotions/v1/organizations/{orgId}/promotions
 *   GET /pricing/shopper-promotions/v1/organizations/{orgId}/promotions/{promotionId}
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiDiscountSpec {
  /** 'percentage', 'fixed', 'amount', 'free_shipping' */
  type?: string
  /** Decimal value (e.g. 10.0 = 10% off or $10 off). */
  amount?: number | null
  percentageOffTotal?: number | null
}

export interface RawScapiPromotion {
  id: string
  name?: string
  calloutMessage?: string
  details?: string
  enabled?: boolean
  couponBased?: boolean
  /** Coupon code — only present when couponBased is true. */
  coupon?: { id: string; code?: string } | null
  discount?: RawScapiDiscountSpec | null
  startDate?: string | null
  endDate?: string | null
  /** Promotion currency (may differ from site default). */
  currency?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(spec: RawScapiDiscountSpec | null | undefined): DiscountType | undefined {
  if (!spec) return undefined
  const t = spec.type?.toLowerCase()
  if (t === 'percentage' || t === 'percentage_off_total') return 'PERCENTAGE'
  if (t === 'fixed' || t === 'amount' || t === 'fixed_price') return 'FIXED_AMOUNT'
  if (t === 'free_shipping' || t === 'shipping') return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(spec: RawScapiDiscountSpec | null | undefined): DiscountAppliesTo | undefined {
  if (!spec) return undefined
  const t = spec.type?.toLowerCase()
  if (t === 'free_shipping' || t === 'shipping') return 'SHIPPING'
  return 'ORDER'
}

function mapValue(spec: RawScapiDiscountSpec | null | undefined, type: DiscountType | undefined, currency: string): number {
  if (!spec) return 0
  const raw = spec.amount ?? spec.percentageOffTotal ?? 0
  if (type === 'FIXED_AMOUNT') {
    return majorToMinor(Math.abs(raw), currency)
  }
  return Math.abs(raw)
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawScapiPromotion): Discount {
  const currency = raw.currency ?? 'USD'
  const type = mapType(raw.discount)
  const value = mapValue(raw.discount, type, currency)
  return {
    id: raw.id,
    code: raw.coupon?.code ?? undefined,
    title: raw.name ?? raw.id,
    type,
    value,
    appliesTo: mapAppliesTo(raw.discount),
    startsAt: toIsoDatetime(raw.startDate),
    endsAt: toIsoDatetime(raw.endDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → SCAPI promotion body (for create/update via admin API). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const discountType =
    discount.type === 'PERCENTAGE'
      ? 'percentage'
      : discount.type === 'FREE_SHIPPING'
        ? 'free_shipping'
        : 'amount'

  return {
    name: discount.title,
    couponBased: Boolean(discount.code),
    enabled: true,
    discount: {
      type: discountType,
      amount: discount.value,
    },
    startDate: discount.startsAt,
    endDate: discount.endsAt,
  }
}
