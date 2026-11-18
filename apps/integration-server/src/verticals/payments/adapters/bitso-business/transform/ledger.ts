/**
 * Bitso *ledger entry* → canonical {@link BalanceTransaction}.
 *
 * Each ledger entry records one account operation (`funding`, `withdrawal`,
 * `trade`, `fee`, …) and the per-currency `balance_updates` it produced. The
 * canonical balance transaction carries a single amount/currency, so we surface
 * the largest-magnitude balance update as the headline amount and fold the rest
 * into `metadata`.
 *
 * Transforms never throw: missing optionals collapse to `undefined`.
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { normalizeCurrency, strMap, toMinorUnits } from './shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawBitsoBalanceUpdate {
  currency?: string
  amount?: string | number
}

export interface RawBitsoLedgerEntry {
  eid?: string
  operation?: string
  created_at?: string
  balance_updates?: RawBitsoBalanceUpdate[]
  details?: Record<string, unknown>
  [k: string]: unknown
}

function mapType(operation: string | undefined): BalanceTransactionType {
  switch ((operation ?? '').toLowerCase()) {
    case 'funding':
      return 'charge'
    case 'withdrawal':
      return 'payout'
    case 'trade':
      return 'transfer'
    case 'fee':
      return 'fee'
    default:
      return 'other'
  }
}

/** Pick the balance update with the largest absolute amount as the headline. */
function primaryUpdate(updates: RawBitsoBalanceUpdate[]): RawBitsoBalanceUpdate | undefined {
  let best: RawBitsoBalanceUpdate | undefined
  let bestMag = -1
  for (const u of updates) {
    const mag = Math.abs(Number(u.amount ?? 0))
    if (Number.isFinite(mag) && mag > bestMag) {
      bestMag = mag
      best = u
    }
  }
  return best ?? updates[0]
}

export function transformLedger(raw: RawBitsoLedgerEntry): BalanceTransaction {
  const updates = raw.balance_updates ?? []
  const primary = primaryUpdate(updates)
  const currency = normalizeCurrency(primary?.currency) ?? 'MXN'
  const id = String(raw.eid ?? '')
  return {
    id,
    externalId: id,
    type: mapType(raw.operation),
    amount: toMinorUnits(primary?.amount, currency) ?? 0,
    currency,
    gateway: 'bitso-business',
    metadata: strMap({
      operation: raw.operation,
      balance_updates: updates,
      ...(raw.details ?? {}),
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
