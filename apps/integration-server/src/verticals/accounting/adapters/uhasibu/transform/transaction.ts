import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

export interface UhasibuTransaction {
  id: string
  memo?: string
  description?: string
  amount?: number
  currency?: string
  type?: string
  account_id?: string
  contact_id?: string
  reference?: string
  [key: string]: unknown
}

export function transformTransaction(raw: UhasibuTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.memo || raw.description || undefined,
    type: raw.type || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseDecimal(raw.amount),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contacts: raw.contact_id ? [{ id: String(raw.contact_id) }] : undefined,
    reference: raw.reference || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
