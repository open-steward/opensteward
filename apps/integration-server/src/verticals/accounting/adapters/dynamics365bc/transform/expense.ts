import type { Expense } from '../../../schema/expense'

export interface BCExpense {
  id: string
  number: string
  vendorId?: string
  vendorNumber?: string
  vendorName?: string
  invoiceDate?: string
  postingDate?: string
  dueDate?: string
  currencyCode?: string
  totalAmountIncludingTax: number
  totalTaxAmount?: number
  status?: string
  [key: string]: unknown
}

export function transformExpense(raw: BCExpense): Expense {
  return {
    id: raw.id,
    contactId: raw.vendorId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmountIncludingTax,
    taxAmount: raw.totalTaxAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
