/**
 * Gumroad Sale (refunded) → canonical Refund.
 *
 * Gumroad does not expose a dedicated refund resource. Refund information
 * is carried on the sale itself via boolean flags (`refunded`,
 * `partially_refunded`). Listing refunds is therefore derived by fetching
 * all sales and filtering for those with `refunded=true` or
 * `partially_refunded=true`.
 *
 * Gumroad also provides `PUT /v2/sales/:id/refund` to trigger a refund;
 * the endpoint returns the updated sale (not a separate refund object).
 *
 * Key mapping:
 *  - `id`               → canonical `id` (prefixed `refund_` to distinguish)
 *  - `id`               → canonical `orderId`
 *  - `price` (cents)    → canonical `amount` (the refunded amount)
 *  - `currency_code`    → canonical `amount.currency`
 *  - `refunded` flag    → marks a full refund
 *  - `partially_refunded` → marks a partial refund
 *  - `created_at`       → canonical `processedAt` / `createdAt`
 *
 * Docs: https://gumroad.com/api (Sales section — refunded / partially_refunded fields)
 */

import type { Refund } from '../../../schema/refund'
import type { RawGumroadSale } from './order'
import { centsToMoney } from './order'

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Derive a canonical Refund from a Gumroad sale that has been refunded.
 * Only call this for sales where `refunded === true` or
 * `partially_refunded === true`.
 */
export function transformRefund(raw: RawGumroadSale): Refund {
  const currency = raw.currency_code ?? 'USD'

  return {
    id: `refund_${raw.id}`,
    orderId: raw.id,
    amount: centsToMoney(raw.price, currency),
    reason: raw.partially_refunded ? 'partial' : 'full',
    processedAt: raw.created_at ?? undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
