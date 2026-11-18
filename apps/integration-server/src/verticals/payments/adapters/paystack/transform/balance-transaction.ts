import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

/**
 * Paystack Balance Ledger — models per-transaction balance changes.
 * Endpoint: GET /balance/ledger  (Transfer Control API)
 * Docs: https://paystack.com/docs/api/transfer-control/
 *
 * Response fields confirmed:
 *   id, integration, domain, balance, currency, difference,
 *   reason, model_responsible, model_row, createdAt, updatedAt
 */
export interface RawPaystackLedgerEntry {
  id?: number
  integration?: number
  domain?: string
  balance?: number
  currency?: string
  difference?: number
  reason?: string
  model_responsible?: string
  model_row?: number
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

function mapType(raw: RawPaystackLedgerEntry): BalanceTransactionType {
  const model = (raw.model_responsible ?? '').toLowerCase()
  switch (model) {
    case 'transaction':
      return 'charge'
    case 'transfer':
      return 'payout'
    case 'refund':
      return 'refund'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawPaystackLedgerEntry): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw),
    amount: raw.difference ?? 0,
    currency: pickCurrency(raw.currency),
    net: raw.difference,
    sourceId: raw.model_row ? String(raw.model_row) : undefined,
    sourceType: raw.model_responsible,
    description: raw.reason,
    gateway: 'paystack',
    metadata: strMap({ domain: raw.domain, integration: raw.integration }),
    createdAt: raw.createdAt,
    raw,
  }
}
