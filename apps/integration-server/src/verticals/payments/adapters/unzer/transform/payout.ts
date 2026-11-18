/**
 * Unzer payout (`/v1/payments/payouts`) ↔ canonical Payout.
 *
 * A payout is a credit transaction — money flows from the merchant back to the
 * customer's account. Unzer models it as a payout transaction resource with the
 * same shape as a charge transaction:
 *
 *   POST /v1/payments/payouts          → creates the payout (response below)
 *   GET  /v1/payments/{paymentId}/payouts/{payoutId}  → fetches a single payout
 *
 * The response carries a positive scalar `amount` string (decimal-major-unit),
 * `currency`, `date`, outcome flags (`isSuccess` / `isPending` / `isError`), a
 * `resources` block (paymentId, typeId, traceId), and a `processing` block
 * (uniqueId, shortId). No arrival-date or destination field is exposed on this
 * endpoint; those are not surfaced by Unzer's API.
 *
 * Docs: https://docs.unzer.com/server-side-integration/direct-api-integration/
 *       manage-api-resources/api-create-payout/
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawUnzerProcessing, RawUnzerResources } from './charge'

export interface RawUnzerPayout {
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

function mapStatus(raw: RawUnzerPayout): PayoutStatus {
  if (raw.isError) return 'failed'
  if (raw.isPending) return 'pending'
  if (raw.isSuccess) return 'paid'
  return 'pending'
}

export function transformPayout(raw: RawUnzerPayout): Payout {
  const currency = pickCurrency(raw.currency)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    failureMessage: raw.message?.merchant || raw.message?.customer || undefined,
    gateway: 'unzer',
    metadata: strMap({
      paymentId: raw.resources?.paymentId,
      typeId: raw.resources?.typeId,
      shortId: raw.processing?.shortId,
      uniqueId: raw.processing?.uniqueId,
    }),
    createdAt: toIsoDatetime(raw.date),
    raw,
  }
}
