/**
 * Soldo transaction → canonical Transaction.
 *
 * Soldo transaction fields (from API v2 /transactions):
 *   id, wallet_id, wallet_name, status, category, transaction_sign,
 *   amount, amount_currency, tx_amount, tx_amount_currency,
 *   fee_amount, fee_currency, date, settlement_date, update_time,
 *   merchant: { id, name, raw_name },
 *   merchant_category: { description, mcc }
 *
 * transaction_sign: "Negative" = debit, "Positive" = credit
 */

import type { Transaction } from '../../../schema/transaction'

export interface SoldoMerchant {
  id?: string
  name?: string
  raw_name?: string
}

export interface SoldoMerchantCategory {
  description?: string
  mcc?: string
}

export interface SoldoTransaction {
  id: string
  wallet_id?: string
  wallet_name?: string
  status?: string
  category?: string
  transaction_sign?: string
  amount?: number
  amount_currency?: string
  tx_amount?: number
  tx_amount_currency?: string
  fee_amount?: number
  fee_currency?: string
  date?: string
  settlement_date?: string
  update_time?: string
  merchant?: SoldoMerchant
  merchant_category?: SoldoMerchantCategory
  [key: string]: unknown
}

/**
 * Convert a Soldo major-unit decimal amount to canonical integer minor units.
 * Soldo returns amounts as decimals (e.g. 100.50 EUR). The canonical Amount
 * schema requires integer minor units (e.g. 10050 for €100.50).
 */
function toMinorUnits(amount: number | undefined | null): number | undefined {
  if (amount == null) return undefined
  return Math.round(amount * 100)
}

export function transformTransaction(raw: SoldoTransaction): Transaction {
  // Map transaction_sign to canonical type
  const type = raw.transaction_sign === 'Positive' ? 'CREDIT' : 'DEBIT'

  const memo = raw.merchant?.name ?? raw.merchant?.raw_name ?? undefined

  return {
    id: raw.id,
    accountId: raw.wallet_id ?? undefined,
    type,
    memo: memo || undefined,
    currency: raw.amount_currency ?? undefined,
    totalAmount: toMinorUnits(raw.amount),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    updatedAt: raw.update_time ? new Date(raw.update_time) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
