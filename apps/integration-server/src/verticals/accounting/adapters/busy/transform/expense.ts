import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'

export interface BusyExpense {
  VoucherNo: string
  Date: string
  Description: string
  GrossAmount: number
  TaxAmount: number
  CurrencyCode: string
  AccCode: string
  PartyCode: string
  [key: string]: unknown
}

export function transformExpense(raw: BusyExpense): Expense {
  return {
    id: String(raw.VoucherNo),
    name: raw.Description || undefined,
    accountId: raw.AccCode || undefined,
    contactId: raw.PartyCode || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: raw.TaxAmount,
    totalAmount: raw.GrossAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    AccCode: expense.accountId,
    PartyCode: expense.contactId,
    CurrencyCode: expense.currency,
    Date: toCalendarDate(expense.postedAt),
    GrossAmount: expense.totalAmount,
    TaxAmount: expense.taxAmount,
    Description: expense.name,
  }
}
