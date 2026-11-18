/**
 * Toast Discount → canonical Discount.
 *
 * Toast discounts are applied at the check or item level. They can
 * be percentage-based, fixed-amount, or open (variable amount).
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { toastPriceToDollars } from './product'

export interface RawToastDiscount {
  guid: string
  name?: string
  type?: string // PERCENT, FIXED, OPEN, BOGO
  percentage?: number
  amount?: number
  active?: boolean
  itemApplyType?: string // ALL, SPECIFIC, CATEGORY
  minAmount?: number
  maxAmount?: number
  nonExclusive?: boolean
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function mapDiscountType(toastType: string | undefined): DiscountType | undefined {
  if (!toastType) return undefined
  switch (toastType.toUpperCase()) {
    case 'PERCENT':
      return 'PERCENTAGE'
    case 'FIXED':
    case 'OPEN':
      return 'FIXED_AMOUNT'
    case 'BOGO':
      return 'BUY_X_GET_Y'
    default:
      return undefined
  }
}

function mapValue(raw: RawToastDiscount): number | undefined {
  if (raw.type?.toUpperCase() === 'PERCENT' && raw.percentage != null) {
    return raw.percentage
  }
  if ((raw.type?.toUpperCase() === 'FIXED' || raw.type?.toUpperCase() === 'OPEN') && raw.amount != null) {
    return toastPriceToDollars(raw.amount)
  }
  return undefined
}

export function transformDiscount(raw: RawToastDiscount): Discount {
  return {
    id: raw.guid,
    title: raw.name ?? undefined,
    type: mapDiscountType(raw.type),
    value: mapValue(raw),
    currency: raw.amount != null ? 'USD' : undefined,
    appliesTo: raw.itemApplyType === 'ALL' ? 'ORDER' : 'PRODUCTS',
    customerEligibility: 'ALL',
    minimumPurchaseAmount: raw.minAmount != null
      ? { amount: toastPriceToDollars(raw.minAmount), currency: 'USD' }
      : undefined,
    createdAt: toIsoDatetime(raw.createdDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Toast discount body for create/update. */
export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const isPercentage = discount.type === 'PERCENTAGE'
  const body: Record<string, unknown> = {
    name: discount.title,
    type: isPercentage ? 'PERCENT' : 'FIXED',
    active: true,
  }
  if (isPercentage) {
    body['percentage'] = discount.value
  } else if (discount.value != null) {
    body['amount'] = discount.value
  }
  if (discount.appliesTo === 'ORDER') {
    body['itemApplyType'] = 'ALL'
  } else {
    body['itemApplyType'] = 'SPECIFIC'
  }
  return body
}
