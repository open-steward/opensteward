/**
 * Plaid Transfer (type: 'credit') → canonical Payout.
 *
 * A `credit` transfer pushes money *out* of the originator account to an
 * end-user's bank account — the canonical Payout shape. We reuse the Transfer
 * raw type from `charge.ts`. Money is a decimal string in major units;
 * timestamps are RFC-3339.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import type { RawPlaidTransfer } from './charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

/**
 * Plaid transfer.status → canonical PayoutStatus.
 *   pending          → pending
 *   posted           → in_transit (handed to the network, not yet settled)
 *   settled / funds_available → paid
 *   failed / returned → failed
 *   cancelled        → cancelled
 */
export function mapPayoutStatus(raw: RawPlaidTransfer): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'settled':
    case 'funds_available':
      return 'paid'
    case 'posted':
      return 'in_transit'
    case 'pending':
      return 'pending'
    case 'failed':
    case 'returned':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawPlaidTransfer): Payout {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.iso_currency_code),
    status: mapPayoutStatus(raw),
    method: (raw.network ?? '').toLowerCase().includes('rtp') ? 'instant' : 'standard',
    statementDescriptor: raw.description ?? undefined,
    failureMessage: raw.failure_reason?.description ?? undefined,
    failureCode: raw.failure_reason?.ach_return_code ?? undefined,
    gateway: 'plaid',
    metadata: strMap({
      type: raw.type,
      network: raw.network,
      account_id: raw.account_id,
      funding_account_id: raw.funding_account_id,
    }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
