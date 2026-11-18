/**
 * Centra Order API Voucher → canonical Discount.
 *
 * Centra surfaces discount codes as "vouchers". The Order API does not expose
 * a dedicated vouchers endpoint in the same way Shopify does; vouchers are
 * referenced on orders via the `voucherValue` field and the `vouchers` plugin.
 *
 * When Centra does return voucher objects (e.g. via batch order data or custom
 * plugin endpoints) they have:
 *  - `voucherId`       — stable id
 *  - `code`            — redeemable code
 *  - `name`            — display name
 *  - `type`            — 'percent' | 'fixed' | 'freeShipping'
 *  - `value`           — discount value (major units or percentage)
 *  - `currency`        — ISO-4217 (for fixed-amount types)
 *  - `startDate`       — ISO-8601
 *  - `stopDate`        — ISO-8601
 *  - `timesUsed`       — usage count
 *  - `usesLeft`        — remaining uses (null = unlimited)
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCentraVoucher {
  voucherId: number | string
  code?: string | null
  name?: string | null
  type?: string | null    // 'percent' | 'fixed' | 'freeShipping'
  value?: string | number
  currency?: string | null
  startDate?: string | null
  stopDate?: string | null
  timesUsed?: number
  usesLeft?: number | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(t: string | null | undefined): DiscountType | undefined {
  if (!t) return undefined
  const lower = t.toLowerCase()
  if (lower === 'percent') return 'PERCENTAGE'
  if (lower === 'fixed') return 'FIXED_AMOUNT'
  if (lower === 'freeshipping' || lower === 'free_shipping') return 'FREE_SHIPPING'
  return undefined
}

export function transformDiscount(raw: RawCentraVoucher): Discount {
  const type = mapType(raw.type)
  const rawValue = toNum(raw.value)
  const currency = raw.currency ?? 'USD'
  // Fixed-amount vouchers are major-unit → convert to minor units.
  // Percentage values are numeric percentages (not money).
  const value =
    type === 'FIXED_AMOUNT'
      ? majorToMinor(rawValue, currency)
      : rawValue

  return {
    id: String(raw.voucherId),
    code: raw.code ?? undefined,
    title: raw.name ?? undefined,
    type,
    value,
    appliesTo: type === 'FREE_SHIPPING' ? 'SHIPPING' : 'ORDER',
    usageCount: raw.timesUsed,
    usageLimit: raw.usesLeft != null ? (raw.timesUsed ?? 0) + raw.usesLeft : undefined,
    startsAt: toIsoDatetime(raw.startDate),
    endsAt: toIsoDatetime(raw.stopDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    PERCENTAGE: 'percent',
    FIXED_AMOUNT: 'fixed',
    FREE_SHIPPING: 'freeShipping',
  }
  return {
    code: discount.code,
    name: discount.title,
    type: discount.type ? typeMap[discount.type] ?? 'percent' : undefined,
    value: discount.value,
    startDate: discount.startsAt,
    stopDate: discount.endsAt,
  }
}
