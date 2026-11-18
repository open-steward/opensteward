import type { Transaction } from '../../../schema/transaction'

export interface NetSuiteTransaction {
  id?: string | number
  tranId?: string
  tranDate?: string
  total?: number
  currency?: string
  entity?: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: NetSuiteTransaction): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    reference: raw.tranId || undefined,
    totalAmount: raw.total,
    currency: raw.currency || undefined,
    createdAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
