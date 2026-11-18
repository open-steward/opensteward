import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ContaAzulTransactionEntry {
  account_id: string
  description: string
  amount: number
  type: string
  [key: string]: unknown
}

export interface ContaAzulTransaction {
  id: string
  account_id: string
  type: string
  reference: string
  currency: string
  total: number
  date: string
  contact_id: string
  contact_name: string
  entries: ContaAzulTransactionEntry[]
  [key: string]: unknown
}

function mapLineitems(raw: ContaAzulTransaction): TransactionLineitem[] {
  return (raw.entries ?? []).map((entry) => ({
    accountId: entry.account_id || undefined,
    description: entry.description || undefined,
    totalAmount: entry.amount,
  }))
}

export function transformTransaction(raw: ContaAzulTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contact_id) {
    contacts.push({ id: raw.contact_id, name: raw.contact_name || undefined })
  }

  return {
    id: String(raw.id),
    accountId: raw.account_id || undefined,
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
