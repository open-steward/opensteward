import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FacturamaExpenseItem {
  Id: string
  AccountCode: string
  Description: string
  Total: number
  TaxAmount: number
  [key: string]: unknown
}

export interface FacturamaExpense {
  Id: string
  Description: string
  SupplierId: string
  Currency: string
  Total: number
  TaxAmount: number
  Date: string
  Items: FacturamaExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: FacturamaExpenseItem): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.AccountCode || undefined,
    itemDescription: row.Description || undefined,
    totalAmount: row.Total,
    taxAmount: row.TaxAmount || undefined,
  }
}

export function transformExpense(raw: FacturamaExpense): Expense {
  return {
    id: String(raw.Id),
    name: raw.Description || undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    taxAmount: raw.TaxAmount || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    SupplierId: expense.contactId,
    Description: expense.name,
    Currency: expense.currency,
    Date: toCalendarDate(expense.postedAt),
    Items: expense.lineItems?.map((li) => ({
      AccountCode: li.accountId,
      Description: li.itemDescription,
      Total: li.totalAmount,
    })),
  }
}
