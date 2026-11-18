/**
 * Bill4Time → canonical Expense transform.
 *
 * Bill4Time v2 expense fields (from B4T API documentation):
 *   ExpenseId, ClientID, ProjectID, UserID, ExpenseDate,
 *   ExpenseCode, Description, Quantity, Rate, Amount, TaxAmount,
 *   IsBillable, IsReimbursable, Reimbursed, Currency
 */
import type { Expense } from '../../../schema/expense'

export interface Bill4TimeExpense {
  ExpenseId?: string | number
  ClientID?: string | number
  ProjectID?: string | number
  UserID?: string | number
  ExpenseDate?: string
  ExpenseCode?: string
  Description?: string
  Quantity?: number
  Rate?: number
  Amount?: number
  TaxAmount?: number
  IsBillable?: boolean
  IsReimbursable?: boolean
  Reimbursed?: boolean
  Currency?: string
  [key: string]: unknown
}

export function transformExpense(raw: Bill4TimeExpense): Expense {
  return {
    id: raw.ExpenseId != null ? String(raw.ExpenseId) : undefined,
    name: raw.Description || raw.ExpenseCode || undefined,
    contactId: raw.ClientID != null ? String(raw.ClientID) : undefined,
    userId: raw.UserID != null ? String(raw.UserID) : undefined,
    currency: raw.Currency || undefined,
    taxAmount: raw.TaxAmount,
    totalAmount: raw.Amount,
    reimbursedAmount: raw.Reimbursed && raw.Amount ? raw.Amount : undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
