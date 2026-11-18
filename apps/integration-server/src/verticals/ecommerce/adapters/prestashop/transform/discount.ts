/**
 * PrestaShop Cart Rule → canonical Discount.
 *
 * PrestaShop's discount/coupon system uses "cart rules" under
 * `/api/cart_rules`. Key fields:
 *  - `reduction_percent` → PERCENTAGE
 *  - `reduction_amount` → FIXED_AMOUNT
 *  - `free_shipping` → FREE_SHIPPING
 *  - `code` → the coupon code
 *  - `quantity` → usage limit
 *  - `quantity_per_user` → per-user usage limit
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawPrestaShopCartRule {
  id: number | string
  code?: string | null
  name?: string | Record<string, string>
  description?: string | Record<string, string>
  reduction_percent?: string | number
  reduction_amount?: string | number
  reduction_currency?: number | string | null
  free_shipping?: string | number
  active?: string | number
  quantity?: number | string
  quantity_per_user?: number | string
  date_from?: string
  date_to?: string
  date_add?: string
  date_upd?: string
  minimum_amount?: string | number
  minimum_amount_currency?: number | string | null
  id_customer?: number | string | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function extractString(v: string | Record<string, string> | undefined | null): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

function mapType(raw: RawPrestaShopCartRule): DiscountType | undefined {
  if (toNum(raw.free_shipping) === 1) return 'FREE_SHIPPING'
  if (toNum(raw.reduction_percent) > 0) return 'PERCENTAGE'
  if (toNum(raw.reduction_amount) > 0) return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawPrestaShopCartRule): DiscountAppliesTo | undefined {
  if (toNum(raw.free_shipping) === 1) return 'SHIPPING'
  return 'ORDER'
}

function mapValue(raw: RawPrestaShopCartRule): number {
  if (toNum(raw.reduction_percent) > 0) return toNum(raw.reduction_percent)
  if (toNum(raw.reduction_amount) > 0) return toNum(raw.reduction_amount)
  return 0
}

export function transformDiscount(raw: RawPrestaShopCartRule): Discount {
  const minimum = toNum(raw.minimum_amount)
  const title = extractString(raw.name)
  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title,
    type: mapType(raw),
    value: mapValue(raw),
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      minimum > 0 ? { amount: majorToMinor(minimum, 'EUR'), currency: 'EUR' } : undefined,
    usageLimit: raw.quantity != null ? Number(raw.quantity) : undefined,
    endsAt: raw.date_to ?? undefined,
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: discount.code,
    name: discount.title,
    quantity: discount.usageLimit,
    date_to: discount.endsAt,
    minimum_amount: discount.minimumPurchaseAmount?.amount != null ? (discount.minimumPurchaseAmount.amount / 100).toString() : undefined,
    active: 1,
  }

  switch (discount.type) {
    case 'PERCENTAGE':
      body['reduction_percent'] = discount.value?.toString()
      body['reduction_amount'] = '0'
      break
    case 'FIXED_AMOUNT':
      body['reduction_amount'] = discount.value?.toString()
      body['reduction_percent'] = '0'
      break
    case 'FREE_SHIPPING':
      body['free_shipping'] = 1
      body['reduction_percent'] = '0'
      body['reduction_amount'] = '0'
      break
    default:
      break
  }

  return body
}
