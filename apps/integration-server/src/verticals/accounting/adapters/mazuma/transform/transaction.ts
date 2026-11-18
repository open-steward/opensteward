import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

export interface MazumaTransaction {
  id: string
  date?: string
  description?: string
  amount?: number
  currency?: string
  type?: string
  account_id?: string
  reference?: string
  [key: string]: unknown
}

export function transformTransaction(raw: MazumaTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    type: raw.type || undefined,
    currency: raw.currency || 'GBP',
    totalAmount: parseDecimal(raw.amount),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    reference: raw.reference || undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
