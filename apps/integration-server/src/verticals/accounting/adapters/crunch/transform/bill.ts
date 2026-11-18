import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { CrunchExpenseDto, CrunchExpenseLineItem } from './expense'

// ── Re-export expense wire types for bill reuse ───────────────────────────────
// Bills in Crunch are modelled as expenses (supplier bills).
// The same ExpenseDto returned by GET /expenses and GET /expenses/{expenseId}
// is used here; we simply surface it under the canonical Bill resource.
export type { CrunchExpenseDto as CrunchBillDto }

// ── Status mapping ────────────────────────────────────────────────────────────

const EXPENSE_STATUS_TO_BILL: Record<string, BillStatus> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'AUTHORIZED',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  OVERDUE: 'OVERDUE',
  VOIDED: 'VOIDED',
  DELETED: 'DELETED',
}

function mapStatus(raw: string | undefined): BillStatus {
  if (!raw) return 'DRAFT'
  const upper = raw.toUpperCase()
  return EXPENSE_STATUS_TO_BILL[upper] ?? 'DRAFT'
}

// ── Line item transform ───────────────────────────────────────────────────────

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

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a Crunch ExpenseDto into the canonical Bill shape.
 *
 * Crunch's expenses API (`GET /expenses/`, `GET /expenses/{id}`) represents
 * supplier bills — there is no separate "bills" API. We derive Bill from
 * the same ExpenseDto already used by the Expense resource.
 */
export function transformBill(raw: CrunchExpenseDto): Bill {
  const lineTotal = (raw.expenseLineItems ?? []).reduce(
    (sum, li) => sum + (li.amount?.grossAmount ?? 0),
    0,
  )
  const vatTotal = (raw.expenseLineItems ?? []).reduce(
    (sum, li) => sum + (li.amount?.vatAmount ?? 0),
    0,
  )

  const payments = raw.supplierPayments ?? []
  const paidTotal = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const outstanding = raw.outstandingBalance ?? 0

  const paidAt =
    payments.length > 0
      ? payments.reduce<string | undefined>((latest, p) => {
          if (!p.date) return latest
          if (!latest) return p.date
          return p.date > latest ? p.date : latest
        }, undefined)
      : undefined

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw.status),
    contactId: raw.supplier?.id !== undefined ? `sup_${raw.supplier.id}` : undefined,
    totalAmount: lineTotal !== 0 ? Math.round(lineTotal * 100) : undefined,
    taxAmount: vatTotal !== 0 ? Math.round(vatTotal * 100) : undefined,
    paidAmount: paidTotal > 0 ? Math.round(paidTotal * 100) : undefined,
    balanceAmount: outstanding !== 0 ? Math.round(outstanding * 100) : undefined,
    notes: raw.note ?? undefined,
    lineItems: mapLineItems(raw.expenseLineItems),
    postedAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    paidAt: paidAt ? new Date(paidAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
