/**
 * Square Catalog DISCOUNT → canonical Discount.
 *
 * Discounts in Square are catalog objects with type=DISCOUNT. They can be
 * FIXED_PERCENTAGE, FIXED_AMOUNT, or VARIABLE_PERCENTAGE / VARIABLE_AMOUNT.
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { squareMoneyToDecimal } from './product'

export interface RawSquareCatalogDiscount {
  id: string
  type: string
  discount_data?: {
    name?: string
    discount_type?: string // FIXED_PERCENTAGE | FIXED_AMOUNT | VARIABLE_PERCENTAGE | VARIABLE_AMOUNT
    percentage?: string
    amount_money?: { amount?: number; currency?: string }
    pin_required?: boolean
    label_color?: string
    modify_tax_basis?: string
  }
  version?: number
  created_at?: string
  updated_at?: string
  is_deleted?: boolean
  [key: string]: unknown
}

function mapDiscountType(squareType: string | undefined): DiscountType | undefined {
  if (!squareType) return undefined
  if (squareType.includes('PERCENTAGE')) return 'PERCENTAGE'
  if (squareType.includes('AMOUNT')) return 'FIXED_AMOUNT'
  return undefined
}

function mapValue(raw: RawSquareCatalogDiscount): number | undefined {
  const data = raw.discount_data
  if (!data) return undefined
  if (data.discount_type?.includes('PERCENTAGE') && data.percentage) {
    return parseFloat(data.percentage)
  }
  if (data.discount_type?.includes('AMOUNT') && data.amount_money?.amount != null) {
    const currency = data.amount_money.currency ?? 'USD'
    return squareMoneyToDecimal(data.amount_money.amount, currency)
  }
  return undefined
}

export function transformDiscount(raw: RawSquareCatalogDiscount): Discount {
  const data = raw.discount_data
  const currency = data?.amount_money?.currency ?? 'USD'
  return {
    id: raw.id,
    title: data?.name ?? undefined,
    type: mapDiscountType(data?.discount_type),
    value: mapValue(raw),
    currency: data?.amount_money ? currency : undefined,
    appliesTo: 'ORDER',
    customerEligibility: 'ALL',
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Square catalog object body for upsert. */
export function untransformDiscount(
  discount: Partial<Discount>,
  version?: number,
): Record<string, unknown> {
  const isPercentage = discount.type === 'PERCENTAGE'
  const discountData: Record<string, unknown> = {
    name: discount.title,
    discount_type: isPercentage ? 'FIXED_PERCENTAGE' : 'FIXED_AMOUNT',
  }
  if (isPercentage) {
    discountData['percentage'] = discount.value?.toString()
  } else if (discount.value != null) {
    discountData['amount_money'] = {
      // Canonical value is already in integer minor units (cents).
      amount: Math.round(discount.value),
      currency: discount.currency ?? 'USD',
    }
  }
  const obj: Record<string, unknown> = {
    type: 'DISCOUNT',
    id: discount.id ?? '#new-discount',
    discount_data: discountData,
  }
  if (version != null) obj['version'] = version
  return obj
}
