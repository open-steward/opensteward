/**
 * Asaas Financial Transaction ↔ canonical BalanceTransaction.
 *
 * Asaas exposes account ledger entries at `GET /financialTransactions` (the
 * "extrato" endpoint). Each entry records one movement: a payment received,
 * a transfer out, a chargeback reversal, etc. The canonical BalanceTransaction
 * maps onto this record.
 *
 * Money: amounts arrive as decimal reais (e.g. `129.9`), converted to integer
 * centavos. Currency is always BRL. Positive `value` = credit; negative = debit.
 *
 * Refs:
 *   https://docs.asaas.com/reference/retrieve-extract
 */
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { ASAAS_CURRENCY, strMap, toIsoDatetime } from './shared'

export interface RawAsaasFinancialTransaction {
  object?: string
  id?: string
  /** Transaction movement amount in reais (decimal). Can be negative. */
  value?: number
  /** Running account balance after this entry, in reais. */
  balance?: number
  /**
   * Entry type string. Observed values include PAYMENT, TRANSFER, CHARGEBACK,
   * INVOICE, REFUND, FEE — but the API may surface additional codes.
   */
  type?: string
  /** ISO date string of when the entry was posted. */
  date?: string
  description?: string
  [k: string]: unknown
}

function mapType(raw: RawAsaasFinancialTransaction): BalanceTransactionType {
  switch ((raw.type ?? '').toUpperCase()) {
    case 'PAYMENT':
      return 'charge'
    case 'REFUND':
      return 'refund'
    case 'TRANSFER':
      return 'payout'
    case 'CHARGEBACK':
      return 'dispute'
    case 'FEE':
      return 'fee'
    case 'INVOICE':
      return 'other'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawAsaasFinancialTransaction): BalanceTransaction {
  const amount = raw.value != null
    ? Math.round(raw.value * 100)
    : 0
  const net = raw.balance != null
    ? Math.round(raw.balance * 100)
    : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw),
    amount,
    currency: ASAAS_CURRENCY,
    net,
    description: raw.description ?? undefined,
    gateway: 'asaas',
    metadata: strMap({ type: raw.type }),
    createdAt: toIsoDatetime(raw.date),
    raw,
  }
}
