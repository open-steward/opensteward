import type { Transaction } from '../../../schema/transaction'

export interface KwaraTransaction {
  id: string
  created_at?: string
  type?: string
  amount?: number
  currency?: string
  member_id?: string
  description?: string
  [key: string]: unknown
}

function mapType(type?: string): string {
  switch (type) {
    case 'credit':
      return 'CREDIT'
    case 'debit':
    default:
      return 'DEBIT'
  }
}

export function transformTransaction(raw: KwaraTransaction): Transaction {
  return {
    id: raw.id,
    type: mapType(raw.type),
    totalAmount: raw.amount,
    currency: raw.currency || undefined,
    contacts: raw.member_id ? [{ id: raw.member_id }] : undefined,
    memo: raw.description || undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
