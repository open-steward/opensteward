import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

export interface PagaTransaction {
  transactionId?: string
  reference?: string
  description?: string
  amount?: number
  currency?: string
  status?: string
  type?: string
  transactionDate?: string
  [key: string]: unknown
}

export function transformTransaction(raw: PagaTransaction): Transaction {
  return {
    id: raw.transactionId || raw.reference || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    type: raw.type || undefined,
    currency: raw.currency || 'NGN',
    totalAmount: parseDecimal(raw.amount),
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
