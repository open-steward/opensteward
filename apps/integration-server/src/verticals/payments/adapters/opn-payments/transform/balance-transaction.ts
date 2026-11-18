/**
 * Opn Payments (Omise) BalanceTransaction transform.
 *
 * Opn Payments exposes balance transactions via GET /transactions and
 * GET /transactions/{id}. Each transaction records an amount moving in or out
 * of the account (charge, refund, transfer, dispute, receipt).
 *
 * Docs: https://docs.omise.co/transactions-api
 *
 * Key response fields:
 *   id, amount, currency, direction ("credit"|"debit"), key (e.g. "charge.captured.net"),
 *   origin (charge/refund/transfer/dispute id), transferable_at, created_at
 */

import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawOpnTransaction {
  [k: string]: unknown
}

/**
 * Map Opn's `key` string (e.g. "charge.captured.net", "refund.created",
 * "transfer.paid") to a canonical BalanceTransactionType.
 */
function mapType(key: string | undefined): BalanceTransactionType {
  const k = (key ?? '').toLowerCase()
  if (k.startsWith('charge')) return 'charge'
  if (k.startsWith('refund')) return 'refund'
  if (k.startsWith('transfer')) return 'payout'
  if (k.startsWith('dispute')) return 'dispute'
  if (k.startsWith('fee') || k.startsWith('receipt')) return 'fee'
  return 'other'
}

export function transformBalanceTransaction(raw: RawOpnTransaction): BalanceTransaction {
  const id = String(raw['id'] ?? '')
  const key = raw['key'] as string | undefined
  // Opn amounts are already in minor units (satang for THB)
  const amount = safeInt(raw['amount'])
  // Debit transactions reduce the balance — represent as negative amount
  const signedAmount = (raw['direction'] as string | undefined) === 'debit' ? -Math.abs(amount) : Math.abs(amount)

  return {
    id,
    externalId: id,
    type: mapType(key),
    amount: signedAmount,
    currency: pickCurrency(raw['currency'] as string | undefined, 'THB'),
    sourceId: raw['origin'] != null ? String(raw['origin']) : undefined,
    sourceType: key != null ? key.split('.')[0] : undefined,
    availableOn: raw['transferable_at'] != null ? String(raw['transferable_at']) : undefined,
    description: key,
    gateway: 'opn-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
