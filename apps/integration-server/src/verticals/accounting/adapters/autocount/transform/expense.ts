import type { Expense } from '../../../schema/expense'

// AutoCount Cloud does not natively expose an expenses endpoint.
// This interface and transform are provided for future use if the API adds expense support.
export interface AutocountExpense {
  DocNo: string
  Description: string
  DocDate: string
  DocAmt: number
  TaxAmt: number
  CurrencyCode: string
  CreditorCode: string
  [key: string]: unknown
}

export function transformExpense(raw: AutocountExpense): Expense {
  return {
    id: raw.DocNo,
    name: raw.Description || undefined,
    contactId: raw.CreditorCode || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: raw.TaxAmt || undefined,
    totalAmount: raw.DocAmt,
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
