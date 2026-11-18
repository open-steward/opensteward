import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

export interface KoraTransaction {
  reference: string
  status?: string
  amount?: number
  currency?: string
  description?: string
  customer?: { id?: string; name?: string }
  narration?: string
  created_at?: string
  [key: string]: unknown
}

export function transformTransaction(raw: KoraTransaction): Transaction {
  return {
    id: raw.reference,
    reference: raw.reference,
    memo: raw.narration || raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseDecimal(raw.amount),
    contacts: raw.customer?.id ? [{ id: String(raw.customer.id), name: raw.customer.name }] : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
