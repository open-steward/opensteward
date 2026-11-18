import type { Transaction } from '../../../schema/transaction'

export interface BillyBankPayment {
  id: string
  entryDate: string
  cashAmount: number
  cashSide: string
  cashAccountId: string
  currencyId: string
  cashExchangeRate: number
  feeAmount: number
  [key: string]: unknown
}

export function transformTransaction(raw: BillyBankPayment): Transaction {
  return {
    id: raw.id,
    accountId: raw.cashAccountId || undefined,
    type: raw.cashSide || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.cashAmount,
    createdAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
