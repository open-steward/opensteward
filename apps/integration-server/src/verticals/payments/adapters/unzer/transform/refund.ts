/**
 * Unzer cancel (refund) ↔ canonical Refund.
 *
 * Unzer models a refund as a **Cancel** against a charge:
 *   POST /v1/payments/{paymentId}/charges/{chargeId}/cancels
 * The response mirrors the charge transaction shape — an `s-cnl-…` id, a scalar
 * decimal `amount`, `isSuccess` / `isPending` / `isError` flags, and a
 * `resources` block linking back to the payment.
 *
 * Money arrives as a decimal-major-unit string, so `toMinorUnits` converts it.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawUnzerProcessing, RawUnzerResources } from './charge'

export interface RawUnzerCancel {
  id?: string
  amount?: string
  currency?: string
  date?: string
  isSuccess?: boolean
  isPending?: boolean
  isError?: boolean
  resources?: RawUnzerResources
  processing?: RawUnzerProcessing
  message?: { merchant?: string; customer?: string }
  [k: string]: unknown
}

function mapStatus(raw: RawUnzerCancel): RefundStatus {
  if (raw.isError) return 'failed'
  if (raw.isPending) return 'pending'
  if (raw.isSuccess) return 'succeeded'
  return 'pending'
}

export function transformRefund(raw: RawUnzerCancel): Refund {
  const currency = pickCurrency(raw.currency)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    // The cancel is anchored to its payment; the charge it reverses lives there.
    chargeId: String(raw.resources?.paymentId ?? ''),
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    failureReason: raw.message?.merchant || raw.message?.customer || undefined,
    gateway: 'unzer',
    metadata: strMap({
      paymentId: raw.resources?.paymentId,
      shortId: raw.processing?.shortId,
      uniqueId: raw.processing?.uniqueId,
    }),
    createdAt: toIsoDatetime(raw.date),
    raw,
  }
}
