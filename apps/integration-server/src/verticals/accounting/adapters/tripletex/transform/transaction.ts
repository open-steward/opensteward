import type { Transaction } from '../../../schema/transaction'

export interface TripletexPayment {
  id: number
  amount: number
  amountCurrency: number
  currency?: { id: string; code: string }
  paymentDate: string
  description: string
  employee?: { id: number; displayName: string }
  [key: string]: unknown
}

export function transformTransaction(raw: TripletexPayment): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amountCurrency,
    lineItems: [
      {
        totalAmount: raw.amountCurrency,
        description: raw.description || undefined,
      },
    ],
    createdAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
