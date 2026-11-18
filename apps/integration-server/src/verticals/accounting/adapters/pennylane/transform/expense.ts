import type { Expense } from '../../../schema/expense'

export interface PennylaneExpense {
  id: string
  label: string
  date: string
  currency: string
  amount: number
  tax_amount: number
  supplier: { source_id: string } | null
  [key: string]: unknown
}

export function transformExpense(raw: PennylaneExpense): Expense {
  return {
    id: raw.id,
    name: raw.label || undefined,
    contactId: raw.supplier?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
