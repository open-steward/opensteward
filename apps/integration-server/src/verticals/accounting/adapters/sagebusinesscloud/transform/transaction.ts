import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

export interface SageTransaction {
  id: string
  date?: string
  type?: string
  total_amount?: number
  contact?: { id?: string }
  reference?: string
  description?: string
  [key: string]: unknown
}

function mapType(type?: string): string | undefined {
  switch (type) {
    case 'PAYMENT': return 'CREDIT'
    case 'RECEIPT': return 'DEBIT'
    default: return type || undefined
  }
}

export function transformTransaction(raw: SageTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contact?.id) contacts.push({ id: raw.contact.id })

  return {
    id: raw.id,
    type: mapType(raw.type),
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: raw.total_amount ?? 0,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
