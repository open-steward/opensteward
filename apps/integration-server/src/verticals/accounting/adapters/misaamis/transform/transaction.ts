import type { Transaction } from '../../../schema/transaction'

export interface MisaAmisBankTransaction {
  id: string
  transaction_date: string
  amount: number
  transaction_type: string
  description: string
  reference: string
  bank_account_id: string
  partner_id: string
  [key: string]: unknown
}

export function transformTransaction(raw: MisaAmisBankTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.bank_account_id || undefined,
    type: raw.transaction_type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    createdAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
