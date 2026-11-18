/**
 * Rebilly transaction of type `credit` → canonical Payout.
 *
 * Rebilly's payout operation is POST /payouts (PostPayout, "Create a credit
 * transaction"): "Creates a transaction of type `credit`." There is no GET
 * /payouts; the credits are read back from GET /transactions.
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import type { RawRebillyTransaction } from './charge'
import { requireId, requireMoney, str, strMap } from './shared'

const PENDING = new Set(['pending', 'sending', 'offsite', 'waiting-approval', 'waiting-gateway'])

function mapStatus(status: string | undefined, result: string | undefined): PayoutStatus {
  if (result === 'declined') return 'failed'
  if (result === 'canceled' || result === 'abandoned' || status === 'voided') return 'cancelled'
  if (status === 'completed') return result === 'approved' ? 'paid' : 'unknown'
  return status !== undefined && PENDING.has(status) ? 'pending' : 'unknown'
}

export function transformPayout(raw: RawRebillyTransaction): Payout {
  const id = requireId(raw.id, 'credit transaction id')
  const money = requireMoney(raw.amount, raw.currency, `credit transaction ${id}`)
  return {
    id,
    externalId: id,
    amount: money.amount,
    currency: money.currency,
    status: mapStatus(raw.status, raw.result),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
