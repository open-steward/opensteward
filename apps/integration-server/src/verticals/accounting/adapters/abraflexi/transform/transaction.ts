import type { Transaction } from '../../../schema/transaction'

export interface AbraflexiTransaction {
  id: string | number
  datVyst?: string
  castka?: number
  mena?: string
  popis?: string
  typPohybu?: string
  ucetni?: string
  [key: string]: unknown
}

export function transformTransaction(raw: AbraflexiTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.ucetni ? String(raw.ucetni) : undefined,
    type: raw.typPohybu || undefined,
    memo: raw.popis || undefined,
    currency: raw.mena || undefined,
    totalAmount: raw.castka,
    createdAt: raw.datVyst ? new Date(raw.datVyst) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
