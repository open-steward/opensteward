import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, toCalendarDate } from '../../shared/transform'

// Fortnox does not have a native expenses endpoint in API v3. This interface
// models the shape of an expense-type supplier invoice or voucher record that
// an adapter method can fetch from the relevant Fortnox endpoint.
export interface FortnoxExpenseRow {
  RowId: number
  AccountNumber: string
  Description: string
  Total: number
  VAT: number
}

export interface FortnoxExpense {
  DocumentNumber: string
  Description: string
  SupplierNumber: string
  Total: number
  VAT: number
  Currency: string
  InvoiceDate: string
  ExpenseRows: FortnoxExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: FortnoxExpenseRow): Lineitem {
  return {
    id: String(row.RowId),
    accountId: row.AccountNumber || undefined,
    itemDescription: row.Description || undefined,
    totalAmount: toMinorUnits(row.Total),
    taxAmount: toMinorUnits(row.VAT) || undefined,
  }
}

export function transformExpense(raw: FortnoxExpense): Expense {
  return {
    id: raw.DocumentNumber,
    name: raw.Description || undefined,
    contactId: raw.SupplierNumber || undefined,
    currency: raw.Currency || undefined,
    taxAmount: toMinorUnits(raw.VAT) || undefined,
    totalAmount: toMinorUnits(raw.Total),
    lineItems: raw.ExpenseRows ? raw.ExpenseRows.map(mapLineitem) : null,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Expense → Fortnox body (for create)
export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    SupplierNumber: expense.contactId,
    Description: expense.name,
    Currency: expense.currency,
    InvoiceDate: toCalendarDate(expense.postedAt),
    ExpenseRows: expense.lineItems?.map((li) => ({
      AccountNumber: li.accountId,
      Description: li.itemDescription,
      Total: fromMinorUnits(li.totalAmount),
    })),
  }
}
