import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface NiboTransaction {
  transactionId: number
  postDate: string
  value: number
  currencyCode: string
  type: string
  accountId: number
  reference: string
  contactId: number
  contactName: string
  description: string
  [key: string]: unknown
}

function mapLineitems(raw: NiboTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.accountId ? String(raw.accountId) : undefined,
      name: raw.description || undefined,
      totalAmount: raw.value,
    },
  ]
}

export function transformTransaction(raw: NiboTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactId) {
    contacts.push({ id: String(raw.contactId), name: raw.contactName || undefined })
  }

  return {
    id: String(raw.transactionId),
    accountId: raw.accountId ? String(raw.accountId) : undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.value,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.postDate ? new Date(raw.postDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
