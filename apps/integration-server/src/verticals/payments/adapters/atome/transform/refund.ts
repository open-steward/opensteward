/**
 * Atome refunds are taken against a **payment**
 * (`POST /payments/{referenceId}/refund` with `{ refundId, refundAmount }`).
 * The endpoint is synchronous and returns the *whole* payment object with the
 * new entry appended to `refundTransactions[]`, so the adapter resolves the
 * created entry (by the idempotency `refundId` it supplied) and feeds it here
 * with the originating payment `referenceId` and currency as context.
 *
 * Money is already integer minor units (no conversion). Because the call is
 * synchronous, a present entry is `succeeded`. The `createAt` field is an
 * epoch-millisecond timestamp string and is normalised with `toIsoDatetime`.
 * The transform never throws — a missing entry yields an empty id rather than
 * an error.
 *
 * There is no standalone refund list/get endpoint, so the adapter only
 * implements `createRefund`; refund history is surfaced via the parent charge's
 * `refundIds`.
 *
 * Docs: https://doc.apaylater.com/v2/
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinor } from './shared'
import type { RawAtomeRefundTransaction } from './charge'

export interface AtomeRefundContext {
  /** The Atome payment `referenceId` the refund was taken against. */
  referenceId: string
  /** Payment currency (Atome refunds inherit the payment currency). */
  currency?: string
}

export function transformRefund(
  raw: RawAtomeRefundTransaction,
  ctx: AtomeRefundContext,
): Refund {
  const currency = pickCurrency(ctx.currency)
  return {
    id: String(raw.refundId ?? raw.transactionId ?? ''),
    externalId: String(raw.refundId ?? raw.transactionId ?? ''),
    chargeId: ctx.referenceId,
    amount: toMinor(raw.amount),
    currency,
    // Atome applies refunds synchronously, so a returned entry is settled.
    status: raw.refundId || raw.transactionId ? 'succeeded' : 'pending',
    gateway: 'atome',
    metadata: strMap({ transaction_id: raw.transactionId }),
    createdAt: toIsoDatetime(raw.createAt),
    raw,
  }
}
