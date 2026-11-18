import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'

export interface FocusSoftnetExpense {
  DocNo: string
  DocDate: string
  TotalAmt: number
  TaxAmt: number
  CurrCode: string
  AccCode: string
  Description: string
  [key: string]: unknown
}

export function transformExpense(raw: FocusSoftnetExpense): Expense {
  return {
    id: String(raw.DocNo),
    name: raw.Description || undefined,
    accountId: raw.AccCode || undefined,
    currency: raw.CurrCode || undefined,
    taxAmount: raw.TaxAmt,
    totalAmount: raw.TotalAmt,
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    AccCode: expense.accountId,
    CurrCode: expense.currency,
    DocDate: toCalendarDate(expense.postedAt),
    TotalAmt: expense.totalAmount,
    TaxAmt: expense.taxAmount,
    Description: expense.name,
  }
}
