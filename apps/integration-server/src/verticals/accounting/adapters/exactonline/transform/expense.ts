import type { Expense } from '../../../schema/expense'

export interface ExactExpense {
  EntryID?: string
  InvoiceNumber?: string
  Supplier?: string
  AmountDC?: number
  VATAmountDC?: number
  Currency?: string
  EntryDate?: string
  Description?: string
  [key: string]: unknown
}

export function transformExpense(raw: ExactExpense): Expense {
  return {
    id: raw.EntryID || undefined,
    contactId: raw.Supplier || undefined,
    name: raw.Description || undefined,
    totalAmount: raw.AmountDC,
    taxAmount: raw.VATAmountDC,
    currency: raw.Currency || undefined,
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
