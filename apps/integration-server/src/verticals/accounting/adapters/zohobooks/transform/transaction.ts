import type { Transaction } from '../../../schema/transaction'

export interface ZohoBooksTransaction {
  transaction_id: string
  transaction_date: string
  account_id: string
  account_name: string
  transaction_type: string
  debit_or_credit: 'debit' | 'credit'
  offset_account_name: string
  currency_code: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export function transformTransaction(raw: ZohoBooksTransaction): Transaction {
  const totalAmount = raw.debit_amount || raw.credit_amount

  return {
    id: raw.transaction_id,
    accountId: raw.account_id || undefined,
    type: raw.transaction_type || undefined,
    currency: raw.currency_code || undefined,
    totalAmount,
    createdAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
