/**
 * Brink Commerce DiscountRule / DiscountCode → canonical Discount.
 *
 * Brink has two discount resources:
 *  - Discount Rules (`PUT /discount-rules`): percentage or fixed-amount rules
 *  - Discount Codes (`PUT /discount-codes`): redeemable codes tied to rules
 *
 * The adapter surfaces discount codes as the primary canonical entity since
 * codes are what shoppers redeem.
 *
 * Docs: https://docs.brinkcommerce.com/technical/api-references/management
 *
 * `transformDiscount` and the `RawBrinkDiscountRule`/`RawBrinkDiscountCode`
 * shapes below serve only the create/update write paths, whose
 * `/discount-rules` and `/discount-codes` paths the docs do not name. The
 * read side uses `transformDiscountCode` below.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Discount, DiscountType } from '../../../schema/discount'

// ── Raw Brink Commerce shapes ────────────────────────────────────────────────

export interface RawBrinkDiscountRule {
  id: string
  name?: string
  discountType?: string // 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'
  discountValue?: number // percentage 0-100 or minor-unit fixed amount
  currencyCode?: string
  isActive?: boolean
  startsAt?: string | null
  endsAt?: string | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export interface RawBrinkDiscountCode {
  id: string
  code?: string
  discountRuleId?: string
  usageLimit?: number | null
  usageCount?: number
  isActive?: boolean
  created?: string
  updated?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapDiscountType(raw?: string): DiscountType | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase()) {
    case 'PERCENTAGE':
      return 'PERCENTAGE'
    case 'FIXED_AMOUNT':
      return 'FIXED_AMOUNT'
    case 'FREE_SHIPPING':
      return 'FREE_SHIPPING'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(
  code: RawBrinkDiscountCode,
  rule?: RawBrinkDiscountRule,
): Discount {
  const type = mapDiscountType(rule?.discountType)
  return {
    id: code.id,
    code: code.code,
    title: rule?.name,
    type,
    // For PERCENTAGE: value is 0-100. For FIXED_AMOUNT: already minor units.
    value: rule?.discountValue,
    currency: type === 'FIXED_AMOUNT' ? (rule?.currencyCode ?? undefined) : undefined,
    usageLimit: code.usageLimit ?? undefined,
    usageCount: code.usageCount,
    startsAt: toIsoDatetime(rule?.startsAt),
    endsAt: toIsoDatetime(rule?.endsAt),
    createdAt: toIsoDatetime(code.created ?? rule?.created),
    metadata: { code, rule } as unknown as Record<string, unknown>,
  }
}

/**
 * `GetDiscountCodeResponse`, what `GET /discounts/codes/{code}` returns
 * (https://docs.brinkcommerce.com/technical/api-references/management/discount/discounts.md).
 * Required: code, created, discountCodeRuleId, isUnlimited, updated,
 * usageLimit, sequenceNumber; optional validDateRange { from, to }.
 */
export interface RawBrinkDiscountCodeResponse {
  code: string
  created: string
  updated: string
  discountCodeRuleId: string
  isUnlimited: boolean
  /** "Amount of times a discount code can be applied." */
  usageLimit: number
  sequenceNumber: number
  validDateRange?: { from: string; to: string }
  [key: string]: unknown
}

/**
 * A discount code as the canonical Discount. The code is its own identifier
 * (the path key of GET/PUT/DELETE /discounts/codes/{code}). What the code does
 * lives in its discount code rule's jsonlogic `outcomes`, which has no
 * canonical type/value, so those stay unset; the rule id is in metadata.
 */
export function transformDiscountCode(raw: RawBrinkDiscountCodeResponse): Discount {
  return {
    id: raw.code,
    code: raw.code,
    usageLimit: raw.isUnlimited ? undefined : raw.usageLimit,
    startsAt: toIsoDatetime(raw.validDateRange?.from),
    endsAt: toIsoDatetime(raw.validDateRange?.to),
    createdAt: toIsoDatetime(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Brink discount-code body. */
export function untransformDiscountCode(discount: Partial<Discount>): Record<string, unknown> {
  return {
    code: discount.code,
    usageLimit: discount.usageLimit,
  }
}

/** Canonical Discount → Brink discount-rule body. */
export function untransformDiscountRule(discount: Partial<Discount>): Record<string, unknown> {
  return {
    name: discount.title,
    discountType:
      discount.type === 'PERCENTAGE'
        ? 'PERCENTAGE'
        : discount.type === 'FIXED_AMOUNT'
          ? 'FIXED_AMOUNT'
          : discount.type === 'FREE_SHIPPING'
            ? 'FREE_SHIPPING'
            : undefined,
    discountValue: discount.value,
    currencyCode: discount.currency,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  }
}
