/**
 * Spryker vouchers/promotions → canonical Discount.
 *
 * Spryker Glue REST API:
 *   GET /vouchers/{voucherCode}      — single voucher
 *   POST /carts/{cartId}/vouchers    — apply voucher to cart
 *   DELETE /carts/{cartId}/vouchers/{voucherCode}
 *
 * Resource type: "vouchers"
 * Key attributes: displayName, isExclusive, expirationDateTime, discountType
 *   ("voucher" | "cart_rule"), amount (percentage or fixed), code.
 *
 * Spryker Cart Rules (type "cart-rules") are separate; they have:
 *   displayName, amount (integer cents), code (null for cart rules),
 *   discountType, isExclusive, expirationDateTime.
 *
 * Prices are already in minor units (integer cents) for FIXED amounts.
 * Percentage discounts are expressed as integers (e.g. 10 = 10%).
 *
 * Note: Spryker Storefront Glue API does not expose a top-level discount list
 * endpoint; the adapter does not implement discount list/get methods. This file
 * retains only the untransform helper needed for write operations (apply voucher).
 */

import type { Discount } from '../../../schema/discount'
import type { JsonApiResource } from '../client'

// ── Raw Spryker shapes ────────────────────────────────────────────────────────

export interface RawSprykerVoucherAttributes {
  displayName?: string | null
  code?: string | null
  discountType?: string | null // "voucher" | "cart_rule" | "percentage" | "fixed"
  amount?: number | null
  isExclusive?: boolean
  expirationDateTime?: string | null
  [key: string]: unknown
}

export type RawSprykerVoucher = JsonApiResource<RawSprykerVoucherAttributes>

/** Canonical Discount → Spryker voucher apply body. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    data: {
      type: 'vouchers',
      attributes: {
        code: discount.code,
      },
    },
  }
}
