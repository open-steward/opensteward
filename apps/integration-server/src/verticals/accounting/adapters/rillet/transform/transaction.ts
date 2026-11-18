import type { Transaction } from '../../../schema/transaction'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'

// ── Rillet API types ───────────────────────────────────────────────────────────

export type { RilletMonetaryAmount }

export interface RilletBankTransaction {
  id: string
  bank_account_id: string
  subsidiary_id: string
  date: string
  name: string
  merchant: string
  net_amount: RilletMonetaryAmount
  fee: RilletMonetaryAmount
  pending: boolean
  excluded: boolean
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RilletBankTransaction): Transaction {
  const currency = raw.net_amount?.currency || undefined

  return {
    id: raw.id,
    accountId: raw.bank_account_id || undefined,
    memo: raw.name || undefined,
    currency,
    totalAmount: rilletAmountToMinor(raw.net_amount),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
