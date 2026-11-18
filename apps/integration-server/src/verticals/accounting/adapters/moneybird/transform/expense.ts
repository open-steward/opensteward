import type { Expense } from '../../../schema/expense'

export interface MoneybirdReceipt {
  id?: number | string
  contact_id?: number | string
  date?: string
  total_price_incl_tax?: string | number
  currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: MoneybirdReceipt): Expense {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_price_incl_tax !== undefined ? Number(raw.total_price_incl_tax) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
