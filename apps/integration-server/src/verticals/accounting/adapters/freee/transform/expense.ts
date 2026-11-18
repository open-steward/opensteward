import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FreeeExpenseApplicationLine {
  id: number
  amount: number
  description: string | null
  account_item_id: number | null
  [key: string]: unknown
}

export interface FreeeExpenseApplication {
  id: number
  title: string | null
  issue_date: string
  total_amount: number
  status: string
  expense_application_lines: FreeeExpenseApplicationLine[]
  [key: string]: unknown
}

function mapLineitem(line: FreeeExpenseApplicationLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_item_id ? String(line.account_item_id) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
  }
}

export function transformExpense(raw: FreeeExpenseApplication): Expense {
  return {
    id: String(raw.id),
    name: raw.title || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.expense_application_lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
