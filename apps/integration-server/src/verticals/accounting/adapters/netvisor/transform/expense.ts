import type { Expense } from '../../../schema/expense'

export interface NetvisorExpense {
  NetvisorKey: number
  Description: string
  VendorIdentifier: string
  Currency: string
  Amount: number
  VatAmount: number
  ExpenseDate: string
  [key: string]: unknown
}

export function transformExpense(raw: NetvisorExpense): Expense {
  return {
    id: String(raw.NetvisorKey),
    name: raw.Description || undefined,
    contactId: raw.VendorIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.VatAmount || undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
