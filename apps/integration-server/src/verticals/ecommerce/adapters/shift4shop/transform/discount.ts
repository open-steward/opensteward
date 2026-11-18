/**
 * Shift4Shop Promotion → canonical Discount.
 *
 * Promotions live under `/Promotions` in the Shift4Shop REST API.
 * Each promotion has an `Action` type (`1` = percent off order,
 * `2` = amount off order, `3` = free shipping, `4` = percent off item,
 * `5` = amount off item, `6` = buy X get Y free) and an optional
 * promotional `Code` (coupon code).
 *
 * Docs: https://apirest.3dcart.com/3dCartWebAPI/v1/Promotions
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopPromotion {
  PromotionID?: number | string | null
  PromotionName?: string | null
  Code?: string | null
  Action?: number | string | null
  DiscountAmount?: number | string | null
  DiscountPercent?: number | string | null
  MinimumOrder?: number | string | null
  UsageCount?: number | string | null
  UsageLimit?: number | string | null
  DateStart?: string | null
  DateEnd?: string | null
  DateCreated?: string | null
  CurrencyCode?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : n
}

function mapDiscountType(action: number | string | null | undefined): DiscountType | undefined {
  const a = typeof action === 'string' ? parseInt(action, 10) : (action ?? 0)
  switch (a) {
    case 1:
    case 4:
      return 'PERCENTAGE'
    case 2:
    case 5:
      return 'FIXED_AMOUNT'
    case 3:
      return 'FREE_SHIPPING'
    case 6:
      return 'BUY_X_GET_Y'
    default:
      return undefined
  }
}

function mapValue(
  raw: RawShift4ShopPromotion,
  currency: string,
): { type: DiscountType | undefined; value: number | undefined } {
  const type = mapDiscountType(raw.Action)
  if (type === 'PERCENTAGE') {
    const pct = toNum(raw.DiscountPercent)
    return { type, value: pct > 0 ? pct : undefined }
  }
  if (type === 'FIXED_AMOUNT') {
    const amt = toNum(raw.DiscountAmount)
    return { type, value: amt > 0 ? majorToMinor(amt, currency) : undefined }
  }
  return { type, value: undefined }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawShift4ShopPromotion): Discount {
  const currency = raw.CurrencyCode ?? 'USD'
  const { type, value } = mapValue(raw, currency)
  const minPurchase = toNum(raw.MinimumOrder)

  return {
    id: String(raw.PromotionID ?? ''),
    code: raw.Code ?? undefined,
    title: raw.PromotionName ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? currency : undefined,
    appliesTo: 'ORDER',
    minimumPurchaseAmount:
      minPurchase > 0
        ? { amount: majorToMinor(minPurchase, currency), currency }
        : undefined,
    usageCount: raw.UsageCount != null ? Math.round(toNum(raw.UsageCount)) : undefined,
    usageLimit: raw.UsageLimit != null ? Math.round(toNum(raw.UsageLimit)) : undefined,
    startsAt: toIsoDatetime(raw.DateStart),
    endsAt: toIsoDatetime(raw.DateEnd),
    createdAt: toIsoDatetime(raw.DateCreated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (discount.title != null) body['PromotionName'] = discount.title
  if (discount.code != null) body['Code'] = discount.code
  if (discount.type === 'PERCENTAGE') {
    body['Action'] = 1
    if (discount.value != null) body['DiscountPercent'] = discount.value
  } else if (discount.type === 'FIXED_AMOUNT') {
    body['Action'] = 2
    if (discount.value != null) body['DiscountAmount'] = discount.value
  } else if (discount.type === 'FREE_SHIPPING') {
    body['Action'] = 3
  }
  if (discount.usageLimit != null) body['UsageLimit'] = discount.usageLimit
  if (discount.startsAt != null) body['DateStart'] = discount.startsAt
  if (discount.endsAt != null) body['DateEnd'] = discount.endsAt
  return body
}
