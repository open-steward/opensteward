import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface LexofficeExpenseItem {
  amount: number
  taxRatePercent: number
  categoryId: string
}

export interface LexofficeExpense {
  id: string
  description: string
  contactId: string
  voucherDate: string
  currency: string
  totalGrossAmount: number
  totalTaxAmount: number
  voucherItems?: LexofficeExpenseItem[]
  [key: string]: unknown
}

export function transformExpense(raw: LexofficeExpense): Expense {
  const lineItems: Lineitem[] | undefined = raw.voucherItems?.map((item, i) => ({
    id: String(i),
    totalAmount: item.amount,
    accountId: item.categoryId || undefined,
  }))

  return {
    id: raw.id,
    name: raw.description || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGrossAmount,
    taxAmount: raw.totalTaxAmount,
    lineItems: lineItems?.length ? lineItems : undefined,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
