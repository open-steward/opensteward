/**
 * ePages Beyond coupon campaign ↔ canonical Discount.
 *
 * Confirmed (`/api/coupon-campaigns`, full CRUD): `POST` create body `name`,
 * `start`, `end`, `discounts[].{type: CART|PRODUCT, value: {type:
 * PERCENT|ABSOLUTE, percentageValue|absoluteValue}}`,
 * `maxNumberOfRedemptions`, `minimumOrderValue`; `PUT /{id}` full update;
 * `PUT /{id}/status` (`{value: "ACTIVE"|"PAUSED"|...}`); redeemable codes
 * live on the separate sub-resource `GET/PUT /coupon-campaigns/{id}/coupons`
 * (not modelled here — the canonical `Discount.code` maps to the campaign's
 * own id, since a campaign can have many codes and the canonical schema has
 * one `code` per `Discount`).
 *
 * `percentageValue`'s scale (0-100 vs. a 0-1 fraction) is not independently
 * confirmed for this field — it is passed through unconverted rather than
 * guessing a scale factor.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Discount, DiscountType } from '../../../schema/discount'

export interface RawEpagesDiscountValue {
  type?: 'PERCENT' | 'ABSOLUTE' | string
  percentageValue?: number
  absoluteValue?: { amount?: number; currency?: string }
}

export interface RawEpagesDiscount {
  type?: 'CART' | 'PRODUCT' | string
  value?: RawEpagesDiscountValue
}

export interface RawEpagesCouponCampaign {
  _id: string
  name: string
  start?: string
  end?: string
  discounts?: RawEpagesDiscount[]
  maxNumberOfRedemptions?: number
  minimumOrderValue?: { amount?: number; currency?: string }
  numberOfRedemptions?: number
  [key: string]: unknown
}

const TYPE: Record<string, DiscountType> = {
  PERCENT: 'PERCENTAGE',
  ABSOLUTE: 'FIXED_AMOUNT',
}

export function transformDiscount(raw: RawEpagesCouponCampaign): Discount {
  const discount = raw.discounts?.[0]
  const value = discount?.value

  return {
    id: raw._id,
    code: raw._id,
    title: raw.name,
    type: value?.type ? (TYPE[value.type] ?? 'unknown') : undefined,
    value: value?.percentageValue ?? value?.absoluteValue?.amount,
    currency: value?.absoluteValue?.currency,
    appliesTo: discount?.type === 'PRODUCT' ? 'PRODUCTS' : discount?.type === 'CART' ? 'ORDER' : undefined,
    minimumPurchaseAmount:
      raw.minimumOrderValue?.amount != null && raw.minimumOrderValue.currency
        ? { amount: raw.minimumOrderValue.amount, currency: raw.minimumOrderValue.currency }
        : undefined,
    usageLimit: raw.maxNumberOfRedemptions,
    usageCount: raw.numberOfRedemptions,
    startsAt: toIsoDatetime(raw.start),
    endsAt: toIsoDatetime(raw.end),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `POST /api/coupon-campaigns` / `PUT /api/coupon-campaigns/{id}`. */
export function untransformDiscount(data: Partial<Discount>): Record<string, unknown> {
  if (!data.title) throw new Error('ePages Beyond createDiscount/updateDiscount requires `title`.')
  if (data.value == null) throw new Error('ePages Beyond createDiscount/updateDiscount requires `value`.')

  const discountValue: Record<string, unknown> =
    data.type === 'FIXED_AMOUNT'
      ? { type: 'ABSOLUTE', absoluteValue: { amount: data.value, currency: data.currency } }
      : { type: 'PERCENT', percentageValue: data.value }

  return {
    name: data.title,
    start: data.startsAt,
    end: data.endsAt,
    discounts: [
      {
        type: data.appliesTo === 'PRODUCTS' ? 'PRODUCT' : 'CART',
        value: discountValue,
      },
    ],
    maxNumberOfRedemptions: data.usageLimit,
    minimumOrderValue:
      data.minimumPurchaseAmount != null
        ? { amount: data.minimumPurchaseAmount.amount, currency: data.minimumPurchaseAmount.currency }
        : undefined,
  }
}
