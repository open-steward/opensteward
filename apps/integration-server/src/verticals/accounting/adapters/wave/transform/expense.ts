import type { Expense } from '../../../schema/expense'

export interface WaveExpense {
  id: string
  description: string
  accountId: string
  vendor: { id: string } | null
  currency: { code: string } | null
  taxAmount: number
  totalAmount: number
  expenseDate: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformExpense(raw: WaveExpense): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    accountId: raw.accountId || undefined,
    contactId: raw.vendor?.id || undefined,
    currency: raw.currency?.code || undefined,
    taxAmount: raw.taxAmount || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.expenseDate ? new Date(raw.expenseDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
