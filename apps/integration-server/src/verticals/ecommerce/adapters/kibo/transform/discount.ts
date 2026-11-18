/**
 * Kibo Commerce Discount (Promotion) → canonical Discount.
 *
 * Kibo promotions live at:
 *   GET /api/commerce/catalog/admin/discounts
 *   GET /api/commerce/catalog/admin/discounts/{discountId}
 *
 * Key fields:
 *   - `discountId`       → id
 *   - `name`             → title
 *   - `conditions.codes[0].code` → code
 *   - `type`             → type
 *   - `amount`/`percent` → value
 *   - `startDate`        → startsAt
 *   - `expirationDate`   → endsAt
 */

import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawKiboDiscount {
  discountId?: number
  name?: string
  friendlyDescription?: string
  type?: string
  conditions?: {
    codes?: Array<{ code?: string; [key: string]: unknown }>
    minOrderSubtotal?: number
    [key: string]: unknown
  }
  amount?: number
  percent?: number
  currencyCode?: string
  startDate?: string
  expirationDate?: string
  maximumUsesPerCouponCode?: number
  timesUsed?: number
  isEnabled?: boolean
  [key: string]: unknown
}

function mapType(t: string | undefined): DiscountType | undefined {
  const v = (t ?? '').toLowerCase()
  if (v.includes('percent') || v.includes('pct')) return 'PERCENTAGE'
  if (v.includes('amount') || v.includes('fixed') || v.includes('flat')) return 'FIXED_AMOUNT'
  if (v.includes('ship')) return 'FREE_SHIPPING'
  if (v.includes('bxgy') || v.includes('buy')) return 'BUY_X_GET_Y'
  return undefined
}

export function transformDiscount(raw: RawKiboDiscount): Discount {
  const id = String(raw.discountId ?? '')
  const code = raw.conditions?.codes?.[0]?.code ?? undefined
  const isPercent = (raw.type ?? '').toLowerCase().includes('percent') || raw.percent != null
  const value = isPercent ? (raw.percent ?? raw.amount) : raw.amount

  return {
    id,
    code,
    title: raw.name ?? id,
    type: mapType(raw.type),
    value: value ?? undefined,
    currency: raw.currencyCode ?? undefined,
    usageLimit: raw.maximumUsesPerCouponCode ?? undefined,
    usageCount: raw.timesUsed ?? undefined,
    startsAt: raw.startDate ?? undefined,
    endsAt: raw.expirationDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
