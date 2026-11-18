import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// Payhawk API v3 expense line item
export interface PayhawkExpenseLine {
  id?: string
  amount?: number
  taxAmount?: number
  accountId?: string
  categoryName?: string
  taxRate?: {
    id?: string
    name?: string
    code?: string
    rate?: number
  }
  [key: string]: unknown
}

// Payhawk API v3 expense supplier sub-object
export interface PayhawkExpenseSupplier {
  id?: string
  name?: string
  vatNumber?: string
  externalId?: string
  [key: string]: unknown
}

// Payhawk API v3 expense object
// Docs: GET /api/v3/accounts/{accountId}/expenses
export interface PayhawkExpense {
  id: string
  reconciliationId?: string
  status?: string                   // e.g. "active", "reviewed", "approved", "rejected", "deleted"
  type?: string                     // e.g. "invoice", "receipt", "perDiem", "mileage", "cashAdvance"
  title?: string
  note?: string
  currency?: string
  paidCurrency?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  totalBaseAmount?: number
  paymentMethod?: string            // e.g. "card", "cash", "bank-transfer", "reimbursement"
  supplier?: PayhawkExpenseSupplier
  category?: {
    id?: string
    name?: string
    [key: string]: unknown
  }
  employee?: {
    id?: string
    name?: string
    email?: string
    [key: string]: unknown
  }
  reviewer?: {
    id?: string
    name?: string
    [key: string]: unknown
  }
  documentDate?: string             // ISO date: issue date on the document
  dueDate?: string                  // ISO date: bill payment due date
  createdAt?: string                // ISO datetime
  updatedAt?: string                // ISO datetime
  reviewedAt?: string               // ISO datetime
  approvedAt?: string               // ISO datetime
  lines?: PayhawkExpenseLine[]
  documents?: {
    id?: string
    url?: string
    mimeType?: string
    fileName?: string
    [key: string]: unknown
  }[]
  [key: string]: unknown
}

/** Convert a Payhawk decimal float amount to integer minor units (cents). */
function toMinorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

function mapLineitem(line: PayhawkExpenseLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    itemDescription: line.categoryName || undefined,
    taxAmount: toMinorUnits(line.taxAmount),
    totalAmount: toMinorUnits(line.amount),
    taxrateId: line.taxRate?.id || undefined,
  }
}

export function transformExpense(raw: PayhawkExpense): Expense {
  const rawTotal = raw.totalAmount ?? raw.amount
  return {
    id: raw.id,
    name: raw.title || undefined,
    contactId: raw.supplier?.id || undefined,
    userId: raw.employee?.id || undefined,
    approverUserId: raw.reviewer?.id || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    taxAmount: toMinorUnits(raw.taxAmount),
    totalAmount: toMinorUnits(rawTotal),
    lineItems: raw.lines && raw.lines.length > 0 ? raw.lines.map(mapLineitem) : undefined,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    approvedAt: raw.approvedAt ? new Date(raw.approvedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
