import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface TiimeTransaction {
  id: string
  compte_id: string
  type: string
  reference: string
  devise: string
  montant: number
  date: string
  contact_id: string
  contact_nom: string
  [key: string]: unknown
}

export function transformTransaction(raw: TiimeTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.compte_id || undefined,
      name: raw.type || undefined,
      totalAmount: raw.montant,
    },
  ]

  return {
    id: String(raw.id),
    accountId: raw.compte_id || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.montant,
    lineItems,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
