/**
 * JD.com seller promotion → canonical Discount.
 *
 * JD exposes seller promotions through the `jingdong.seller.promotion.v2.list`
 * and `jingdong.seller.promotion.v2.get` API methods. The response envelope
 * is `jingdong_seller_promotion_v2_list_responce` (or `_get_`).
 *
 * JD's promotion system maps to the canonical Discount as follows:
 *  - PromoType 1 (single item) with FavorMode=1 (discount/rate) → PERCENTAGE
 *  - PromoType 1 with FavorMode=0 (full-amount reduction) → FIXED_AMOUNT
 *  - PromoType 10 (total price / order mode) → FIXED_AMOUNT or PERCENTAGE
 *  - All others → mapped as FIXED_AMOUNT with the raw `quota` value
 *
 * `Rate` is a discount rate (e.g. 90 = 90% of price = 10% off).
 * `Quota` is a fixed CNY reduction amount in yuan.
 * `BeginTime` / `EndTime` are millisecond timestamps as strings.
 */

import type { Discount, DiscountType } from '../../../schema/discount'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdPromotion {
  accountId?: number | string
  promoId?: number | string
  promoName?: string
  promoType?: number | string
  favorMode?: number | string
  promoStatus?: string
  beginTime?: number | string
  endTime?: number | string
  created?: number | string
  modified?: number | string
  /** Rate-based discount: e.g. 90 means 90% of the price (= 10% off). */
  rate?: number | string
  /** Fixed reduction amount in CNY yuan. */
  quota?: number | string
  plus?: number | string
  bound?: number | string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive canonical DiscountType from JD promotion fields.
 * PromoType: 1=single-item, 4=gift, 6=bundle, 10=order-total.
 * FavorMode: 0=gift/free, 1=rate/percentage, 7=tiered-discount.
 */
function mapDiscountType(promoType: number, favorMode: number): DiscountType {
  if (favorMode === 1) return 'PERCENTAGE'
  if (favorMode === 0 && promoType === 4) return 'BUY_X_GET_Y'
  return 'FIXED_AMOUNT'
}

/**
 * Convert a JD rate (0–100, where 90 = 90% price = 10% off) to a
 * canonical percentage-off value (0–100, where 10 = 10% off).
 */
function rateToPercentOff(rate: number): number {
  return Math.max(0, 100 - rate)
}

function msToIso(ms: number | string | undefined): string | undefined {
  if (ms == null) return undefined
  const n = Number(ms)
  if (!n) return undefined
  return new Date(n).toISOString()
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawJdPromotion): Discount {
  const promoType = Number(raw.promoType ?? 1)
  const favorMode = Number(raw.favorMode ?? 0)
  const type = mapDiscountType(promoType, favorMode)

  let value: number | undefined
  if (type === 'PERCENTAGE') {
    const rate = raw.rate != null ? Number(raw.rate) : undefined
    value = rate != null ? rateToPercentOff(rate) : undefined
  } else {
    value = raw.quota != null ? Number(raw.quota) : undefined
  }

  return {
    id: raw.promoId != null ? String(raw.promoId) : '0',
    title: raw.promoName,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' || type === 'BUY_X_GET_Y' ? 'CNY' : undefined,
    appliesTo: 'PRODUCTS',
    startsAt: msToIso(raw.beginTime),
    endsAt: msToIso(raw.endTime),
    createdAt: msToIso(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
