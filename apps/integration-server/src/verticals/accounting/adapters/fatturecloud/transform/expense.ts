import type { Expense } from '../../../schema/expense'

export interface FattureCloudExpense {
  id?: number | string
  number?: string
  entity?: { id?: number | string }
  date?: string
  currency?: { id?: string }
  totals?: { amount?: number; vat_amount?: number }
  description?: string
  [key: string]: unknown
}

export function transformExpense(raw: FattureCloudExpense): Expense {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.description || undefined,
    contactId: raw.entity?.id !== undefined ? String(raw.entity.id) : undefined,
    totalAmount: raw.totals?.amount,
    taxAmount: raw.totals?.vat_amount,
    currency: raw.currency?.id || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
