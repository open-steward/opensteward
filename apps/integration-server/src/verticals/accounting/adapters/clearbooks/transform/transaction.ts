import type { Transaction } from '../../../schema/transaction'

export interface ClearBooksTransaction {
  transaction_id: string | number
  date: string
  description: string
  amount: number
  currency: string
  [key: string]: unknown
}

function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

export function transformTransaction(raw: ClearBooksTransaction): Transaction {
  return {
    id: String(raw.transaction_id),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    createdAt: parseUkDate(raw.date as string),
    metadata: raw as Record<string, unknown>,
  }
}
