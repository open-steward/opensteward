import type { Expense } from '../../../schema/expense'

export interface FakturoidExpense {
  id: number
  description: string
  subject_id: number
  currency: string
  total: number
  vat_price: number
  issued_on: string
  [key: string]: unknown
}

export function transformExpense(raw: FakturoidExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    contactId: raw.subject_id ? String(raw.subject_id) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vat_price || undefined,
    totalAmount: raw.total,
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
