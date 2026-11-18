import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface MisaAmisExpenseDetail {
  id: string
  description: string
  amount: number
  vat_amount: number
  account_id: string
  account_code: string
  [key: string]: unknown
}

export interface MisaAmisExpense {
  id: string
  expense_number: string
  report_date: string
  total_amount: number
  vat_amount: number
  status: number
  employee_id: string
  description: string
  expense_details: MisaAmisExpenseDetail[]
  [key: string]: unknown
}

function mapLineitem(row: MisaAmisExpenseDetail): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformExpense(raw: MisaAmisExpense): Expense {
  return {
    id: raw.id,
    name: raw.expense_number || undefined,
    userId: raw.employee_id || undefined,
    taxAmount: raw.vat_amount || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.expense_details ?? []).map(mapLineitem),
    postedAt: raw.report_date ? new Date(raw.report_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
