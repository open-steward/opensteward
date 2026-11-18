/**
 * Crystallize Discount -> canonical Discount.
 *
 * Crystallize handles discounts through order-level discount entries
 * and price variant logic. We model explicit discount codes/vouchers.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCrystallizeDiscount {
  id: string
  name?: string | null
  code?: string | null
  type?: string // 'percentage' | 'fixed' | 'free_shipping'
  value?: number | null
  currency?: string | null
  appliesTo?: string | null // 'order' | 'products' | 'shipping'
  productIds?: string[] | null
  usageLimit?: number | null
  usageCount?: number | null
  startsAt?: string | null
  endsAt?: string | null
  createdAt?: string
  [key: string]: unknown
}

function mapType(raw: RawCrystallizeDiscount): DiscountType | undefined {
  const t = (raw.type ?? '').toLowerCase()
  if (t === 'percentage') return 'PERCENTAGE'
  if (t === 'fixed' || t === 'fixed_amount') return 'FIXED_AMOUNT'
  if (t === 'free_shipping') return 'FREE_SHIPPING'
  return undefined
}

function mapAppliesTo(raw: RawCrystallizeDiscount): DiscountAppliesTo | undefined {
  const a = (raw.appliesTo ?? '').toLowerCase()
  if (a === 'shipping') return 'SHIPPING'
  if (a === 'order') return 'ORDER'
  if (a === 'products') return 'PRODUCTS'
  return undefined
}

export function transformDiscount(raw: RawCrystallizeDiscount): Discount {
  return {
    id: raw.id,
    code: raw.code ?? undefined,
    title: raw.name ?? undefined,
    type: mapType(raw),
    value: raw.value ?? undefined,
    currency: raw.currency ?? undefined,
    appliesTo: mapAppliesTo(raw),
    productIds: raw.productIds && raw.productIds.length > 0 ? raw.productIds : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.usageCount ?? undefined,
    startsAt: raw.startsAt ?? undefined,
    endsAt: raw.endsAt ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  if (discount.type === 'PERCENTAGE') type = 'percentage'
  else if (discount.type === 'FIXED_AMOUNT') type = 'fixed'
  else if (discount.type === 'FREE_SHIPPING') type = 'free_shipping'

  let appliesTo: string | undefined
  if (discount.appliesTo === 'SHIPPING') appliesTo = 'shipping'
  else if (discount.appliesTo === 'ORDER') appliesTo = 'order'
  else if (discount.appliesTo === 'PRODUCTS') appliesTo = 'products'

  return {
    name: discount.title,
    code: discount.code,
    type,
    value: discount.value,
    appliesTo,
    usageLimit: discount.usageLimit,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  }
}
