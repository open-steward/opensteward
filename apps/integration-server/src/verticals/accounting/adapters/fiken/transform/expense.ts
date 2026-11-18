import type { Expense } from '../../../schema/expense'

export interface FikenExpense {
  purchaseId: number
  identifier: string
  supplierId: number
  currency: string
  net: number
  vat: number
  gross: number
  date: string
  description: string
  [key: string]: unknown
}

export function transformExpense(raw: FikenExpense): Expense {
  return {
    id: String(raw.purchaseId),
    name: raw.description || raw.identifier || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vat || undefined,
    totalAmount: raw.gross,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
