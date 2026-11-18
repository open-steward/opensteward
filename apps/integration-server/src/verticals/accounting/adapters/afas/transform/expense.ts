/**
 * AFAS Profit_Declaraties GetConnector → canonical Expense transform.
 *
 * Fields returned by the Profit_Declaraties standard GetConnector:
 *   DeclarationNr   — unique expense claim / declaration number
 *   EmployeeId      — employee code (filer)
 *   Description     — expense description
 *   AmtTotal        — total claimed amount (base currency)
 *   AmtTax          — VAT / tax portion
 *   CurrencyId      — ISO-4217 currency code
 *   DeclarationDate — date of the expense
 *   ApprovalDate    — approval date (if approved)
 *   PaymentDate     — date the reimbursement was paid
 *   Status          — "O" (open), "A" (approved), "P" (paid)
 */
import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface AfasExpenseClaim {
  DeclarationNr: string
  EmployeeId?: string | null
  Description?: string | null
  AmtTotal?: number | null
  AmtTax?: number | null
  CurrencyId?: string | null
  DeclarationDate?: string | null
  ApprovalDate?: string | null
  PaymentDate?: string | null
  Status?: string | null
  [key: string]: unknown
}

function parseDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

export function transformExpense(raw: AfasExpenseClaim): Expense {
  return {
    id: raw.DeclarationNr,
    name: raw.Description || undefined,
    userId: raw.EmployeeId || undefined,
    currency: raw.CurrencyId || undefined,
    taxAmount: toMinorUnits(raw.AmtTax),
    totalAmount: toMinorUnits(raw.AmtTotal),
    postedAt: parseDate(raw.DeclarationDate),
    approvedAt: parseDate(raw.ApprovalDate),
    reimbursedAt: parseDate(raw.PaymentDate),
    metadata: raw as Record<string, unknown>,
  }
}
