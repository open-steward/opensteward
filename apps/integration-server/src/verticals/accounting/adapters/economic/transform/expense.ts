import type { Expense } from '../../../schema/expense'

export interface EconomicExpense {
  entryNumber: number
  account: { accountNumber: number; name: string } | null
  supplier: { supplierNumber: number; name: string } | null
  amount: number
  amountInBaseCurrency: number
  currency: string
  text: string
  date: string
  vatAmount: number
  [key: string]: unknown
}

export function transformExpense(raw: EconomicExpense): Expense {
  return {
    id: String(raw.entryNumber),
    name: raw.text || undefined,
    accountId: raw.account?.accountNumber ? String(raw.account.accountNumber) : undefined,
    contactId: raw.supplier?.supplierNumber ? String(raw.supplier.supplierNumber) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vatAmount || undefined,
    totalAmount: Math.abs(raw.amount),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
