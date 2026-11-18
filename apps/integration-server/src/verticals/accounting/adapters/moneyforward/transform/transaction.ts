import type { Transaction } from '../../../schema/transaction'

export interface MoneyForwardBankAccountTransaction {
  id: string
  bank_account_id: string
  transaction_date: string
  amount: number
  description: string | null
  balance: number
  [key: string]: unknown
}

export function transformTransaction(raw: MoneyForwardBankAccountTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.bank_account_id ? String(raw.bank_account_id) : undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    lineItems: [
      {
        totalAmount: raw.amount,
        description: raw.description || undefined,
      },
    ],
    createdAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
