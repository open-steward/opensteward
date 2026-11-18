import type { Transaction } from '../../../schema/transaction'

export interface EconomicEntry {
  entryNumber: number
  account: { accountNumber: number; name: string } | null
  amount: number
  amountInBaseCurrency: number
  currency: string
  text: string
  date: string
  entryType: string
  voucherNumber: number
  [key: string]: unknown
}

export function transformTransaction(raw: EconomicEntry): Transaction {
  return {
    id: String(raw.entryNumber),
    accountId: raw.account?.accountNumber ? String(raw.account.accountNumber) : undefined,
    type: raw.entryType || undefined,
    reference: raw.voucherNumber ? String(raw.voucherNumber) : undefined,
    memo: raw.text || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
