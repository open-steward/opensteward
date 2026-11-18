/**
 * NOWPayments payout (withdrawal) → canonical Payout.
 *
 * Fields are the ones in the "Mass payouts / List of payouts" (GET /v1/payout,
 * {"payouts":[...]}) and "Get payout status" (GET /v1/payout/:payout_id,
 * {"id","createdAt","withdrawals":[...]}) examples of the official
 * collection, https://documenter.getpostman.com/view/7907941/2s93JusNJt:
 * id, batch_withdrawal_id, status, error, currency, amount ("94.088939", a
 * decimal string), address, hash, created_at, requested_at, updated_at.
 *
 * The currency is the ticker paid out ("trx"). The canonical schema takes a
 * 3-letter code and integer minor units at the currency's ISO exponent (2 for
 * any code not in the ISO table), so a crypto amount is rounded to two places
 * and a longer ticker ("usdttrc20") cannot be represented and throws.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { requireAmount, requireCurrency, requireId, strMap } from './shared'

export interface RawNowpaymentsPayout {
  id?: number | string | null
  batch_withdrawal_id?: number | string | null
  status?: string | null
  error?: string | null
  currency?: string | null
  amount?: number | string | null
  address?: string | null
  hash?: string | null
  created_at?: string | null
  requested_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * The documented payout statuses: "creating", "waiting", "processing",
 * "sending", "finished", "failed" ("processing may resume"), "rejected"
 * ("will not be processed further"). Responses spell them upper case
 * ("FINISHED", "CREATING").
 */
function mapStatus(s: string | null | undefined): PayoutStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'creating':
    case 'waiting':
      return 'pending'
    case 'processing':
    case 'sending':
      return 'in_transit'
    case 'finished':
      return 'paid'
    case 'failed':
    case 'rejected':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformPayout(raw: RawNowpaymentsPayout): Payout {
  const id = requireId(raw.id, 'payout')
  const currency = requireCurrency(raw.currency, `payout ${id}`)
  return {
    id,
    externalId: id,
    amount: majorToMinor(requireAmount(raw.amount, `payout ${id}`), currency),
    currency,
    status: mapStatus(raw.status),
    failureMessage: raw.error ?? undefined,
    gateway: 'nowpayments',
    metadata: strMap({
      address: raw.address,
      batch_withdrawal_id: raw.batch_withdrawal_id,
      status: raw.status,
      hash: raw.hash,
      amount: raw.amount,
      requested_at: raw.requested_at,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
