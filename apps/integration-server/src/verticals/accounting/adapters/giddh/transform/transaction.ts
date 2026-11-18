import type { Transaction } from '../../../schema/transaction'

export interface GiddhLedgerEntry {
  uniqueName: string
  entryDate: string
  particular: string
  debit: number
  credit: number
  balance: number
  description: string
  [key: string]: unknown
}

export function transformTransaction(raw: GiddhLedgerEntry): Transaction {
  const totalAmount = raw.debit > 0 ? raw.debit : -raw.credit

  return {
    id: raw.uniqueName,
    type: raw.debit > 0 ? 'DEBIT' : 'CREDIT',
    memo: raw.description || undefined,
    totalAmount,
    createdAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
