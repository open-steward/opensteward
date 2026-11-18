import type { Expense } from '../../../schema/expense'

export interface ClearBooksExpense {
  expense_id: string | number
  date: string
  description: string
  total_gross: number
  total_tax: number
  currency: string
  entity_id: string | number
  [key: string]: unknown
}

function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

export function transformExpense(raw: ClearBooksExpense): Expense {
  return {
    id: String(raw.expense_id),
    totalAmount: raw.total_gross,
    taxAmount: raw.total_tax || undefined,
    name: raw.description || undefined,
    contactId: raw.entity_id ? String(raw.entity_id) : undefined,
    currency: raw.currency || undefined,
    postedAt: parseUkDate(raw.date as string),
    metadata: raw as Record<string, unknown>,
  }
}
