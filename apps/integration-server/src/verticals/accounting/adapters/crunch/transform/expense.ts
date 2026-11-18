import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// ── Crunch wire types ─────────────────────────────────────────────────────────

export interface CrunchAmountDto {
  grossAmount?: number
  netAmount?: number
  vatAmount?: number
}

export interface CrunchExpenseLineItem {
  id?: number
  expenseType?: string
  vatType?: string
  description?: string
  amount?: CrunchAmountDto
  employee?: { id?: number; forename?: string; surname?: string; displayableName?: string }
}

export interface CrunchSupplierRef {
  id?: number
  companyName?: string
  contactName?: string
  country?: string
}

/** ExpenseDto from GET /expenses/{expenseId} */
export interface CrunchExpenseDto {
  id?: number
  supplier?: CrunchSupplierRef
  supplierReference?: string
  note?: string
  expenseLineItems?: CrunchExpenseLineItem[]
  supplierPayments?: Array<{
    id?: number
    date?: string
    amount?: number
    paymentTarget?: {
      paymentMethod?: { paymentMethodName?: string }
    }
    reconciled?: boolean
  }>
  postingDate?: string
  status?: string
  outstandingBalance?: number
  deletable?: boolean
  editable?: boolean
  reconciled?: boolean
  recharged?: boolean
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapLineItems(items: CrunchExpenseLineItem[] | undefined): Lineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id !== undefined ? String(item.id) : undefined,
    itemDescription: item.description ?? undefined,
    taxAmount:
      item.amount?.vatAmount !== undefined ? Math.round(item.amount.vatAmount * 100) : undefined,
    totalAmount:
      item.amount?.grossAmount !== undefined
        ? Math.round(item.amount.grossAmount * 100)
        : undefined,
  }))
}

function derivePaymentMethod(raw: CrunchExpenseDto): string | undefined {
  const pm = raw.supplierPayments?.[0]?.paymentTarget?.paymentMethod?.paymentMethodName
  return pm ?? undefined
}

export function transformExpense(raw: CrunchExpenseDto): Expense {
  // Compute total from line items when the top-level total is absent
  const lineTotal = (raw.expenseLineItems ?? []).reduce(
    (sum, li) => sum + (li.amount?.grossAmount ?? 0),
    0,
  )

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    contactId: raw.supplier?.id !== undefined ? `sup_${raw.supplier.id}` : undefined,
    paymentMethod: derivePaymentMethod(raw),
    totalAmount: lineTotal !== 0 ? Math.round(lineTotal * 100) : undefined,
    taxAmount: (raw.expenseLineItems ?? []).reduce((sum, li) => {
      return sum + (li.amount?.vatAmount !== undefined ? Math.round(li.amount.vatAmount * 100) : 0)
    }, 0) || undefined,
    lineItems: mapLineItems(raw.expenseLineItems),
    postedAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
