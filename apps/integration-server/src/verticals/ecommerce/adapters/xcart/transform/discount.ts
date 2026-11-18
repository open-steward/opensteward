/**
 * X-Cart Coupon → canonical Discount.
 *
 * X-Cart coupons are accessed via GET /api/coupons.
 *
 * Key fields:
 *   id, code, type (percent|absolute|freeShipping), discount,
 *   uses_count, uses_limit, date_start, date_end, enabled
 */
import type { Discount, DiscountType } from '../../../schema/discount'

export interface XCartCoupon {
  id?: number | string
  code?: string | null
  comment?: string | null
  type?: string | null
  discount?: number | null
  /** Number of times the coupon has been used. */
  uses_count?: number | null
  /** Maximum usage limit (0 = unlimited). */
  uses_limit?: number | null
  date_start?: number | string | null
  date_end?: number | string | null
  enabled?: boolean | null
  [key: string]: unknown
}

function mapType(raw: string | null | undefined): DiscountType | undefined {
  switch ((raw ?? '').toLowerCase()) {
    case 'percent':
    case 'percentage':
      return 'PERCENTAGE'
    case 'absolute':
    case 'fixed':
      return 'FIXED_AMOUNT'
    case 'freeshipping':
    case 'free_shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function toIso(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!isFinite(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformDiscount(raw: XCartCoupon): Discount {
  return {
    id: String(raw.id ?? ''),
    code: raw.code ?? undefined,
    title: raw.comment ?? raw.code ?? undefined,
    type: mapType(raw.type),
    value: raw.discount ?? undefined,
    usageLimit: raw.uses_limit ?? undefined,
    usageCount: raw.uses_count ?? undefined,
    startsAt: toIso(raw.date_start),
    endsAt: toIso(raw.date_end),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
