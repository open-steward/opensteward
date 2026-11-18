/**
 * Aimeos Coupon → canonical Discount.
 *
 * Aimeos exposes coupon/discount records via JSON:API at `GET /api/coupon`.
 * Coupons in Aimeos are "provider-based" — the discount type and value are
 * encoded inside the `coupon.config` JSON string rather than as top-level
 * numeric fields.
 *
 * `coupon` resource attributes (dot-notation):
 *   coupon.id          — numeric/string id
 *   coupon.label       — internal label (e.g. "10% off all orders")
 *   coupon.provider    — provider class name (e.g. "PercentRebate", "FixedRebate",
 *                        "FreeShipping", "Voucher")
 *   coupon.config      — JSON string with provider-specific config:
 *                          PercentRebate: {"percent": "10"}
 *                          FixedRebate:   {"fixedrebate.value": {"EUR": "5.00"}}
 *                          FreeShipping:  {}
 *   coupon.datestart   — ISO datetime when coupon becomes active (nullable)
 *   coupon.dateend     — ISO datetime when coupon expires (nullable)
 *   coupon.status      — int: 1=enabled, 0=disabled, -1=review, -2=archived
 *   coupon.ctime       — ISO datetime created
 *   coupon.mtime       — ISO datetime updated
 *
 * Coupon codes (the redeemable strings) are stored in a separate
 * `coupon/code` sub-resource and are not fetched here. The coupon.id is
 * used as the canonical discount id.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import type { AimeosResource } from '../client'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosCouponAttributes {
  'coupon.id'?: string | number
  'coupon.label'?: string
  'coupon.provider'?: string
  'coupon.config'?: string | Record<string, unknown> | null
  'coupon.datestart'?: string | null
  'coupon.dateend'?: string | null
  'coupon.status'?: number
  'coupon.ctime'?: string | null
  'coupon.mtime'?: string | null
  [key: string]: unknown
}

export type AimeosCoupon = AimeosResource & {
  attributes: AimeosCouponAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse coupon.config which may be a JSON string or already an object.
 */
function parseConfig(config: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config) return {}
  if (typeof config === 'object') return config
  try {
    return JSON.parse(config) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Map Aimeos coupon provider name to canonical DiscountType.
 *
 *   PercentRebate  → PERCENTAGE
 *   FixedRebate    → FIXED_AMOUNT
 *   FreeShipping   → FREE_SHIPPING
 *   Voucher        → FIXED_AMOUNT (voucher = fixed rebate product)
 *   TierRebate     → PERCENTAGE (closest match)
 *   default        → FIXED_AMOUNT
 */
function mapProviderToType(provider: string | undefined): DiscountType | undefined {
  if (!provider) return undefined
  const lower = provider.toLowerCase()
  if (lower.includes('percent') || lower.includes('tier')) return 'PERCENTAGE'
  if (lower.includes('freeshipping') || lower === 'freeshipping') return 'FREE_SHIPPING'
  if (lower.includes('fixed') || lower.includes('voucher')) return 'FIXED_AMOUNT'
  return undefined
}

/**
 * Extract discount value from the parsed config.
 *
 * PercentRebate stores:  { "percent": "10" }
 * FixedRebate stores:    { "fixedrebate.value": { "EUR": "5.00" } }
 */
function extractValue(
  provider: string | undefined,
  config: Record<string, unknown>,
): { value?: number; currency?: string } {
  if (!provider) return {}
  const lower = provider.toLowerCase()

  if (lower.includes('percent') || lower.includes('tier')) {
    const pct = config['percent'] ?? config['percentage']
    if (pct != null) {
      const v = parseFloat(String(pct))
      return isNaN(v) ? {} : { value: v }
    }
  }

  if (lower.includes('fixed')) {
    const fixedMap = config['fixedrebate.value']
    if (fixedMap != null && typeof fixedMap === 'object' && !Array.isArray(fixedMap)) {
      const entries = Object.entries(fixedMap as Record<string, string>)
      if (entries.length > 0) {
        const [currency, amount] = entries[0]!
        const v = parseFloat(String(amount))
        return isNaN(v) ? {} : { value: v, currency }
      }
    }
  }

  return {}
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformDiscount(raw: AimeosCoupon): Discount {
  const attrs = raw.attributes
  const provider = attrs['coupon.provider'] as string | undefined
  const config = parseConfig(attrs['coupon.config'])
  const { value, currency } = extractValue(provider, config)
  const type = mapProviderToType(provider)

  return {
    id: raw.id,
    title: (attrs['coupon.label'] as string | undefined) ?? undefined,
    type,
    value,
    currency,
    appliesTo: 'ORDER',
    startsAt: (attrs['coupon.datestart'] as string | undefined) ?? undefined,
    endsAt: (attrs['coupon.dateend'] as string | undefined) ?? undefined,
    createdAt: (attrs['coupon.ctime'] as string | undefined) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
