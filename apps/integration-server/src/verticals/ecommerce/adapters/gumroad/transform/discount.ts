/**
 * Gumroad Offer Code → canonical Discount.
 *
 * Gumroad exposes offer codes via the Products API under
 * `/products/:product_id/offer_codes`. Each offer code is scoped to one
 * product (unless `universal` is true).
 *
 * Key mapping:
 *  - `id`                 → canonical `id`
 *  - `name`               → canonical `code` (the code buyers enter)
 *  - `percent_off`        → canonical `value` (type = PERCENTAGE)
 *  - `amount_cents`       → canonical `value` (type = FIXED_AMOUNT, cents)
 *  - `max_purchase_count` → canonical `usageLimit`
 *  - `times_used`         → canonical `usageCount`
 *  - `universal`          → whether it applies to all products
 *
 * Gumroad offer codes are always product-scoped unless `universal=true`.
 * The `product_id` context must be threaded in from the caller.
 *
 * Docs: https://gumroad.com/api (Offer Codes section)
 */

import type { Discount } from '../../../schema/discount'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGumroadOfferCode {
  id: string
  /** The redeemable code string buyers enter at checkout. */
  name: string
  /** Percentage discount (0–100). Mutually exclusive with amount_cents. */
  percent_off?: number | null
  /** Fixed discount in cents. Mutually exclusive with percent_off. */
  amount_cents?: number | null
  /** Max number of times this code can be used. */
  max_purchase_count?: number | null
  /** How many times the code has been used. */
  times_used?: number
  /** Whether the offer code applies to all of the seller's products. */
  universal?: boolean
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawGumroadOfferCode, productId?: string): Discount {
  const isPercentage = raw.percent_off != null && raw.percent_off !== 0
  const type = isPercentage ? 'PERCENTAGE' : 'FIXED_AMOUNT'
  const value = isPercentage
    ? (raw.percent_off as number)
    : (raw.amount_cents ?? undefined)

  return {
    id: raw.id,
    code: raw.name,
    title: raw.name,
    type,
    value: value != null ? value : undefined,
    currency: !isPercentage ? 'USD' : undefined,
    appliesTo: 'PRODUCTS',
    productIds:
      raw.universal || productId == null
        ? undefined
        : [productId],
    usageLimit: raw.max_purchase_count ?? undefined,
    usageCount: raw.times_used ?? undefined,
    customerEligibility: 'ALL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
