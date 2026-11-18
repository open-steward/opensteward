import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

export interface DeskeraTransaction {
  id: string
  date?: string
  amount?: number
  type?: string
  description?: string
  reference?: string
  contactCode?: string
  bankAccountCode?: string
  [key: string]: unknown
}

export function transformTransaction(raw: DeskeraTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactCode) {
    contacts.push({ id: raw.contactCode })
  }

  return {
    id: raw.id,
    accountId: raw.bankAccountCode || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    totalAmount: raw.amount ?? 0,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
