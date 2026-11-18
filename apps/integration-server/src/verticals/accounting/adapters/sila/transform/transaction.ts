import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

export interface SilaTransaction {
  transaction_id?: string
  reference_id?: string
  description?: string
  sila_amount?: number
  usd_amount?: number
  status?: string
  transaction_type?: string
  user_handle?: string
  created?: string
  [key: string]: unknown
}

export function transformTransaction(raw: SilaTransaction): Transaction {
  return {
    id: raw.transaction_id || undefined,
    reference: raw.reference_id || undefined,
    memo: raw.description || undefined,
    type: raw.transaction_type || undefined,
    currency: 'USD',
    totalAmount: parseDecimal(raw.usd_amount ?? (raw.sila_amount !== undefined ? raw.sila_amount / 100 : undefined)),
    contacts: raw.user_handle ? [{ id: raw.user_handle }] : undefined,
    createdAt: raw.created ? new Date(raw.created) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
