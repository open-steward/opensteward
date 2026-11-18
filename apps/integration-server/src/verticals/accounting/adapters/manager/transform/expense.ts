/**
 * Manager expense-claims → canonical Expense transform.
 *
 * API endpoint: GET /api2/expense-claims
 *               GET /api2/expense-claim-form/{key}
 *               POST /api2/expense-claim-form  (create)
 *
 * Docs: https://manager.readme.io/reference/getexpenseclaims.md
 *       https://manager.readme.io/reference/getexpenseclaimform.md
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 *
 * Expense claims in Manager represent employee-submitted reimbursable
 * expenses.  Each record has a payer (paidBy), an optional payee/contact,
 * a date, a reference, a description, and one or more line items each
 * pointing to a chart-of-accounts account.
 */
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerExpenseClaimLine {
  account?: string
  lineDescription?: string
  qty?: number
  unitPrice?: number
  taxCode?: string
  taxAmount?: { value?: number; currency?: string | null }
  amount?: { value?: number; currency?: string | null }
  [key: string]: unknown
}

export interface ManagerExpenseClaim {
  /** UUID key used as the record id */
  key?: string
  /** ISO date string e.g. "2026-02-01" */
  date?: string
  reference?: string
  /** The employee/person who paid (payer) — UUID key */
  paidBy?: string
  /** Optional supplier/payee contact — UUID key */
  payee?: string
  description?: string
  /** Total amount of the claim as a money object */
  amount?: { value?: number; currency?: string | null }
  lines?: ManagerExpenseClaimLine[]
  [key: string]: unknown
}

function mapLineitem(line: ManagerExpenseClaimLine): Lineitem {
  return {
    accountId: line.account || undefined,
    itemDescription: line.lineDescription || undefined,
    unitAmount: toMinorUnits(line.unitPrice),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    taxAmount: toMinorUnits(line.taxAmount?.value),
    totalAmount: toMinorUnits(line.amount?.value),
  }
}

export function transformExpense(raw: ManagerExpenseClaim): Expense {
  return {
    id: raw.key,
    accountId: raw.lines?.[0]?.account || undefined,
    contactId: raw.payee || undefined,
    userId: raw.paidBy || undefined,
    currency: (raw.amount?.currency as string) || undefined,
    totalAmount: toMinorUnits(raw.amount?.value),
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
