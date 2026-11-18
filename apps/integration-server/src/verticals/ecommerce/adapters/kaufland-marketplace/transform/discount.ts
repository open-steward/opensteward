/**
 * Kaufland Marketplace Voucher → canonical Discount.
 *
 * Kaufland exposes a voucher (coupon) resource via GET/POST /vouchers. Each
 * voucher has a code, discount type (percentage or fixed amount in eurocents),
 * usage limits, and validity dates. The API is read-only in terms of
 * listing; creation is supported via POST.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-vouchers
 */

import type { Discount, DiscountType } from '../../../schema/discount'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandVoucher {
  id_voucher?: number | string | null
  /** Redeemable code. */
  code?: string | null
  /** Discount type: 'percentage' or 'fixed'. */
  type?: string | null
  /** Percentage value (0–100) for type='percentage'. */
  percentage?: number | null
  /**
   * Fixed discount amount in eurocents (minor units) for type='fixed'.
   * Already integer minor units — no conversion needed.
   */
  amount?: number | null
  /** Currency for fixed-amount vouchers. */
  currency?: string | null
  /** Maximum number of times the voucher can be used. */
  usage_limit?: number | null
  /** Number of times it has been redeemed. */
  usage_count?: number | null
  /** ISO start date/time. */
  valid_from_iso?: string | null
  /** ISO end date/time. */
  valid_until_iso?: string | null
  ts_created_iso?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapType(raw: string | null | undefined): DiscountType | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower === 'percentage') return 'PERCENTAGE'
  if (lower === 'fixed' || lower === 'fixed_amount') return 'FIXED_AMOUNT'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawKauflandVoucher): Discount {
  const type = mapType(raw.type)
  // Percentage vouchers: value is the percentage (0-100).
  // Fixed-amount vouchers: amount is already in minor units (eurocents).
  const value = type === 'PERCENTAGE'
    ? (raw.percentage ?? undefined)
    : (raw.amount ?? undefined)
  const currency = raw.currency ?? 'EUR'

  return {
    id: raw.id_voucher != null ? String(raw.id_voucher) : (raw.code ?? ''),
    code: raw.code ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count ?? undefined,
    startsAt: raw.valid_from_iso ?? undefined,
    endsAt: raw.valid_until_iso ?? undefined,
    createdAt: raw.ts_created_iso ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Build the POST /vouchers request body from a canonical Discount. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const isPercentage = discount.type === 'PERCENTAGE'
  return {
    code: discount.code,
    type: isPercentage ? 'percentage' : 'fixed',
    ...(isPercentage
      ? { percentage: discount.value ?? 0 }
      : { amount: discount.value ?? 0, currency: discount.currency ?? 'EUR' }),
    usage_limit: discount.usageLimit,
    valid_from_iso: discount.startsAt,
    valid_until_iso: discount.endsAt,
  }
}
