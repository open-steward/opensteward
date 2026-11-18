import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface AlegraTransactionEntry {
  accountId: number
  description: string
  amount: number
  type: string
  [key: string]: unknown
}

export interface AlegraTransaction {
  id: number
  accountId: number
  type: string
  reference: string
  currency: string
  total: number
  date: string
  contactId: number
  contactName: string
  entries: AlegraTransactionEntry[]
  [key: string]: unknown
}

function mapLineitems(raw: AlegraTransaction): TransactionLineitem[] {
  return (raw.entries ?? []).map((entry) => ({
    accountId: entry.accountId ? String(entry.accountId) : undefined,
    description: entry.description || undefined,
    totalAmount: entry.amount,
  }))
}

export function transformTransaction(raw: AlegraTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactId) {
    contacts.push({ id: String(raw.contactId), name: raw.contactName || undefined })
  }

  return {
    id: String(raw.id),
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
