/**
 * Tabby refunds are taken against a **payment**
 * (`POST /api/v2/payments/{id}/refunds` with `{ amount, reference_id, reason }`).
 * The endpoint returns the *whole* payment object with the new refund appended
 * to its `refunds[]` array, so the adapter resolves the created entry from
 * there and feeds it here with the originating payment id as context.
 *
 * Money is a decimal string in the major unit; we convert to minor units via
 * the payment currency (see ./shared). Tabby applies refunds synchronously, so
 * a present entry is `succeeded`. The transform never throws — a missing entry
 * yields an empty id rather than an error.
 *
 * There is no standalone refund list/get endpoint, so the adapter only
 * implements `createRefund`.
 *
 * Docs: https://docs.tabby.ai/api-reference/payments/refund-a-payment
 */
import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawTabbyRefundEntry } from './charge'

export interface TabbyRefundContext {
  /** The Tabby payment id the refund was taken against. */
  paymentId: string
  /** Payment currency, used to convert the decimal-string amount. */
  currency?: string
}

export function transformRefund(raw: RawTabbyRefundEntry, ctx: TabbyRefundContext): Refund {
  const currency = pickCurrency(ctx.currency)
  return {
    id: String(raw.id ?? raw.reference_id ?? ''),
    externalId: String(raw.id ?? raw.reference_id ?? ''),
    chargeId: ctx.paymentId,
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    // Tabby returns the refund on the payment synchronously, so it is settled.
    status: raw.id || raw.reference_id ? 'succeeded' : 'pending',
    metadata: strMap({ reason: raw.reason, reference_id: raw.reference_id }),
    gateway: 'tabby',
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
