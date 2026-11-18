/**
 * Dooca Commerce Discount → canonical Discount.
 *
 * Dooca discounts (cupons) are managed through a promotions / discount API.
 * Key fields from the Dooca coupons endpoint:
 *   - `code` — the redeemable code
 *   - `type` — "percent" | "value" | "free_shipping"
 *   - `value` — decimal string (percentage value or fixed BRL amount)
 *   - `minimum_value` — minimum order value to apply discount
 *   - `usage_limit` — maximum number of uses
 *   - `usage_count` — current use count
 *   - `active` — boolean
 *   - `starts_at`, `expires_at` — ISO date strings
 *
 * Docs: https://docs.dooca.com.br/descontos/api
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

const CURRENCY = 'BRL'

export interface RawDoocaDiscount {
  id: number | string
  code?: string | null
  name?: string | null
  type?: string | null        // percent | value | free_shipping
  value?: string | number | null
  minimum_value?: string | number | null
  usage_limit?: number | null
  usage_count?: number | null
  active?: boolean
  starts_at?: string | null
  expires_at?: string | null
  created_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapType(raw: RawDoocaDiscount): DiscountType | undefined {
  switch (raw.type) {
    case 'percent':
      return 'PERCENTAGE'
    case 'value':
      return 'FIXED_AMOUNT'
    case 'free_shipping':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

function mapAppliesTo(raw: RawDoocaDiscount): DiscountAppliesTo | undefined {
  if (raw.type === 'free_shipping') return 'SHIPPING'
  return 'ORDER'
}

export function transformDiscount(raw: RawDoocaDiscount): Discount {
  const type = mapType(raw)
  const rawValue = toNum(raw.value)
  // FIXED_AMOUNT values are BRL major units → convert to minor units.
  // Percentages stay as-is.
  const value = type === 'FIXED_AMOUNT' ? majorToMinor(rawValue, CURRENCY) : rawValue
  const minValue = toNum(raw.minimum_value)

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: raw.name ?? raw.code ?? undefined,
    type,
    value,
    currency: type === 'FIXED_AMOUNT' ? CURRENCY : undefined,
    appliesTo: mapAppliesTo(raw),
    minimumPurchaseAmount:
      minValue > 0
        ? { amount: majorToMinor(minValue, CURRENCY), currency: CURRENCY }
        : undefined,
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count ?? undefined,
    customerEligibility: 'ALL',
    startsAt: toIsoDatetime(raw.starts_at) ?? undefined,
    endsAt: toIsoDatetime(raw.expires_at) ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Dooca discount body (for create/update). */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let type: string | undefined
  switch (discount.type) {
    case 'PERCENTAGE':
      type = 'percent'
      break
    case 'FIXED_AMOUNT':
      type = 'value'
      break
    case 'FREE_SHIPPING':
      type = 'free_shipping'
      break
    default:
      break
  }

  // FIXED_AMOUNT values are minor units → convert back to BRL major units.
  const value =
    discount.type === 'FIXED_AMOUNT' && discount.value != null
      ? (discount.value / 100).toFixed(2)
      : discount.value?.toString()

  const minimumValue =
    discount.minimumPurchaseAmount?.amount != null
      ? (discount.minimumPurchaseAmount.amount / 100).toFixed(2)
      : undefined

  return {
    code: discount.code,
    name: discount.title,
    type,
    value,
    minimum_value: minimumValue,
    usage_limit: discount.usageLimit,
    starts_at: discount.startsAt,
    expires_at: discount.endsAt,
    active: true,
  }
}
