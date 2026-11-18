/**
 * commercetools CartDiscount (+ optional DiscountCode) → canonical Discount.
 *
 * commercetools splits discount concerns across three resources:
 *  - `CartDiscount`     — the rule itself (value, target, predicate)
 *  - `ProductDiscount`  — storefront list-price discounts (not handled
 *                          by this adapter; use cart-discount + discount-code)
 *  - `DiscountCode`     — the redeemable code attached to one or more
 *                          cart discounts
 *
 * The canonical `Discount.code` is populated when the caller supplies a
 * DiscountCode alongside the CartDiscount.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { DEFAULT_LOCALE } from '../constants'
import { pickLocalized, type RawCtLocalizedString } from './variant'

export interface RawCtCartDiscountValueRelative {
  type: 'relative'
  permyriad: number // 1/10000 (e.g. 1000 = 10%)
}

export interface RawCtCartDiscountValueAbsolute {
  type: 'absolute'
  money: Array<{ currencyCode: string; centAmount: number; fractionDigits?: number }>
}

export interface RawCtCartDiscountValueGift {
  type: 'giftLineItem'
  product?: { id: string }
}

export type RawCtCartDiscountValue =
  | RawCtCartDiscountValueRelative
  | RawCtCartDiscountValueAbsolute
  | RawCtCartDiscountValueGift

export interface RawCtCartDiscount {
  id: string
  version?: number
  key?: string
  name: RawCtLocalizedString
  description?: RawCtLocalizedString
  value: RawCtCartDiscountValue
  cartPredicate?: string
  target?: { type: string }
  sortOrder?: string
  isActive?: boolean
  requiresDiscountCode?: boolean
  validFrom?: string
  validUntil?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export interface RawCtDiscountCode {
  id: string
  version?: number
  code: string
  name?: RawCtLocalizedString
  cartDiscounts?: Array<{ id: string; typeId: 'cart-discount' }>
  isActive?: boolean
  maxApplications?: number
  maxApplicationsPerCustomer?: number
  applicationsCount?: number
  createdAt?: string
  [key: string]: unknown
}

function mapType(value: RawCtCartDiscountValue): DiscountType | undefined {
  switch (value.type) {
    case 'relative':
      return 'PERCENTAGE'
    case 'absolute':
      return 'FIXED_AMOUNT'
    case 'giftLineItem':
      // Closest canonical analogue — commercetools gift line items
      // approximate BOGO behaviour and are not free shipping.
      return 'FIXED_AMOUNT'
    default:
      return undefined
  }
}

function mapValue(value: RawCtCartDiscountValue): number | undefined {
  if (value.type === 'relative') {
    // permyriad → percent (1000 = 10.00%)
    return value.permyriad / 100
  }
  if (value.type === 'absolute') {
    const first = value.money[0]
    if (!first) return undefined
    // `centAmount` is already integer minor units — pass through.
    return Math.round(first.centAmount)
  }
  return undefined
}

function mapCurrency(value: RawCtCartDiscountValue): string | undefined {
  if (value.type === 'absolute') return value.money[0]?.currencyCode
  return undefined
}

function mapAppliesTo(target: { type: string } | undefined): DiscountAppliesTo | undefined {
  if (!target) return undefined
  switch (target.type) {
    case 'lineItems':
      return 'PRODUCTS'
    case 'shipping':
      return 'SHIPPING'
    case 'customLineItems':
    case 'totalPrice':
      return 'ORDER'
    default:
      return undefined
  }
}

export function transformDiscount(
  rule: RawCtCartDiscount,
  code?: RawCtDiscountCode,
  locale: string = DEFAULT_LOCALE,
): Discount {
  return {
    id: rule.id,
    code: code?.code,
    title: pickLocalized(rule.name, locale),
    type: mapType(rule.value),
    value: mapValue(rule.value),
    currency: mapCurrency(rule.value),
    appliesTo: mapAppliesTo(rule.target),
    usageLimit: code?.maxApplications,
    usageCount: code?.applicationsCount,
    startsAt: rule.validFrom,
    endsAt: rule.validUntil,
    createdAt: rule.createdAt,
    metadata: { rule, code } as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Discount → commercetools `CartDiscountDraft` body for
 * `POST /cart-discounts`. The separate discount-code (if any) is
 * created in a second round-trip by the adapter's `createDiscount`.
 */
export function untransformDiscount(
  discount: Partial<Discount>,
  locale: string = DEFAULT_LOCALE,
): Record<string, unknown> {
  const name = discount.title ? { [locale]: discount.title } : { [locale]: 'Discount' }

  let value: Record<string, unknown> | undefined
  if (discount.type === 'PERCENTAGE' && discount.value != null) {
    value = { type: 'relative', permyriad: Math.round(discount.value * 100) }
  } else if (discount.type === 'FIXED_AMOUNT' && discount.value != null) {
    value = {
      type: 'absolute',
      money: [
        {
          type: 'centPrecision',
          currencyCode: discount.currency ?? 'USD',
          centAmount: Math.round(discount.value),
        },
      ],
    }
  }

  return {
    name,
    value,
    cartPredicate: '1 = 1',
    target: { type: 'lineItems', predicate: '1 = 1' },
    sortOrder: '0.1',
    requiresDiscountCode: discount.code != null,
    isActive: true,
    validFrom: discount.startsAt,
    validUntil: discount.endsAt,
  }
}

/**
 * Translate canonical partial Discount updates to commercetools cart-
 * discount update actions.
 */
export function buildActionsForDiscount(
  _current: RawCtCartDiscount,
  updates: Partial<Discount>,
  locale: string = DEFAULT_LOCALE,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.title !== undefined) {
    actions.push({ action: 'changeName', name: { [locale]: updates.title } })
  }
  if (updates.startsAt !== undefined) {
    actions.push({ action: 'setValidFrom', validFrom: updates.startsAt })
  }
  if (updates.endsAt !== undefined) {
    actions.push({ action: 'setValidUntil', validUntil: updates.endsAt })
  }
  return actions
}
