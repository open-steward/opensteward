import type { Expense } from '../../../schema/expense'

export interface DineroExpense {
  Guid: string
  Description: string
  ContactGuid: string
  Currency: string
  TotalInclVat: number
  TotalVat: number
  Date: string
  [key: string]: unknown
}

export function transformExpense(raw: DineroExpense): Expense {
  return {
    id: raw.Guid,
    name: raw.Description || undefined,
    contactId: raw.ContactGuid || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalInclVat,
    taxAmount: raw.TotalVat || undefined,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
