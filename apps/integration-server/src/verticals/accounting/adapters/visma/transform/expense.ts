import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface VismaExpenseRow {
  LineNumber: number
  AccountNumber: number
  Text: string
  TotalAmount: number
  TotalVatAmount: number
  CostCenterItemId1: string
  ProjectId: string
  [key: string]: unknown
}

export interface VismaExpense {
  Id: string
  SupplierId: string
  SupplierNumber: string
  Description: string
  CurrencyCode: string
  TotalAmount: number
  VatAmount: number
  InvoiceDate: string
  Rows: VismaExpenseRow[]
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

function mapLineitem(row: VismaExpenseRow): Lineitem {
  return {
    id: String(row.LineNumber),
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
    itemDescription: row.Text || undefined,
    totalAmount: row.TotalAmount,
    taxAmount: row.TotalVatAmount || undefined,
  }
}

export function transformExpense(raw: VismaExpense): Expense {
  return {
    id: raw.Id,
    name: raw.Description || undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: raw.VatAmount || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Rows ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    SupplierId: expense.contactId,
    Description: expense.name,
    CurrencyCode: expense.currency,
    InvoiceDate: toCalendarDate(expense.postedAt),
    Rows: expense.lineItems?.map((li, i) => ({
      LineNumber: i + 1,
      AccountNumber: li.accountId ? Number(li.accountId) : undefined,
      Text: li.itemDescription,
      TotalAmount: li.totalAmount,
    })),
  }
}
