/**
 * StoreHippo `ms.coupon_codes` record → canonical Discount.
 *
 * "It allows you to offer coupon codes to your customers for marketing of
 * your online store." Fields, from the ms-coupon_codes reference
 * (https://help.storehippo.com/api/reference/ms-coupon_codes):
 *   coupon_code    "Name of the coupon code." (ex GET 25)
 *   name           string
 *   type           "Type of coupon code. Coupon code can be either flat or percentage type." (ex flat)
 *   amount         "Amount of the discount." (ex 25)
 *   number_of_uses "Maximum usage of the coupon code allowed." (ex 3)
 *   start_date     "Starting date and time for application of coupon code." (ex 2018-04-25T06:48:00.000Z)
 *   end_date       "Date and time at which the coupon code expires." (ex 2018-04-30T06:48:00.000Z)
 * `_id` is on every record in the documented responses.
 *
 * A flat amount is in the store's default currency, which the adapter reads
 * from ms.currencies and passes in.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { count, numeric, recordId, text } from '../values'

export interface RawStoreHippoCouponCode {
  _id?: string
  coupon_code?: string
  name?: string
  description?: string
  type?: string
  amount?: number | string
  enabled?: string
  number_of_uses?: number
  start_date?: string
  end_date?: string
  [key: string]: unknown
}

function mapType(v: unknown): DiscountType | undefined {
  if (v === 'flat') return 'FIXED_AMOUNT'
  if (v === 'percentage') return 'PERCENTAGE'
  return typeof v === 'string' && v !== '' ? 'unknown' : undefined
}

export function transformDiscount(raw: RawStoreHippoCouponCode, currency: string): Discount {
  const id = recordId(raw, 'coupon code')
  const type = mapType(raw.type)
  const amount = numeric(raw.amount)
  const value =
    amount === undefined || amount < 0
      ? undefined
      : type === 'FIXED_AMOUNT'
        ? majorToMinor(amount, currency)
        : type === 'PERCENTAGE'
          ? amount
          : undefined
  const usageLimit = count(raw.number_of_uses)
  return {
    id,
    ...(text(raw.coupon_code) ? { code: raw.coupon_code } : {}),
    ...(text(raw.name) ? { title: raw.name } : {}),
    ...(type ? { type } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(value !== undefined && type === 'FIXED_AMOUNT' ? { currency } : {}),
    ...(usageLimit !== undefined ? { usageLimit } : {}),
    ...(text(raw.start_date) ? { startsAt: raw.start_date } : {}),
    ...(text(raw.end_date) ? { endsAt: raw.end_date } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Discount → StoreHippo coupon body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  if (discount.type === 'PERCENTAGE') type = 'percent'
  else if (discount.type === 'FIXED_AMOUNT') type = 'flat'
  else if (discount.type === 'FREE_SHIPPING') type = 'free_shipping'

  // FIXED_AMOUNT values are stored as integer minor units; convert back to major for StoreHippo.
  // PERCENTAGE values are a plain 0-100 decimal — pass through unchanged.
  const discountValue =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? minorToMajor(discount.value, discount.currency)
      : discount.value

  return {
    code: discount.code ?? discount.title,
    type,
    discount: discountValue,
    minOrderAmount:
      discount.minimumPurchaseAmount?.amount != null
        ? minorToMajor(
            discount.minimumPurchaseAmount.amount,
            discount.minimumPurchaseAmount.currency,
          )
        : undefined,
    maxUsage: discount.usageLimit,
    startDate: discount.startsAt,
    endDate: discount.endsAt,
  }
}
