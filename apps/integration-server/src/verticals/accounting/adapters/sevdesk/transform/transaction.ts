import type { Transaction } from '../../../schema/transaction'

export interface SevDeskTransaction {
  id: string
  amount: number
  date: string
  paymentMethod: { id: string; objectName: string } | null
  checkAccount: { id: string } | null
  valueDate: string
  description: string
  type: string
  currency: string
  entryDate: string
  [key: string]: unknown
}

export function transformTransaction(raw: SevDeskTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.checkAccount?.id || undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems: [
      {
        totalAmount: raw.amount,
        description: raw.description || undefined,
      },
    ],
    createdAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
