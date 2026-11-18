/**
 * Tyms does not have a dedicated vendor-bill / supplier-invoice endpoint.
 * The closest equivalent is the expenses endpoint (`GET /api/v1/expenses`),
 * which covers both employee expenses and vendor bills.  We reuse the
 * TymsExpense wire type and derive a Bill from it.
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
export type { TymsExpense } from './expense'
import type { TymsExpense, TymsExpenseItem } from './expense'

function mapStatus(raw: TymsExpense): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial' || s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'void' || s === 'voided' || s === 'cancelled') return 'VOIDED'
  if (s === 'draft') return 'DRAFT'
  if (s === 'approved' || s === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function extractTaxAmount(tax: TymsExpense['tax']): number | undefined {
  if (tax === undefined || tax === null) return undefined
  if (typeof tax === 'number') return tax
  return typeof tax.amount === 'number' ? tax.amount : undefined
}

function mapLineitem(item: TymsExpenseItem): Lineitem {
  return {
    id: item.uuid || undefined,
    accountId: item.account || undefined,
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.price ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    totalAmount: item.amount ?? undefined,
    taxAmount: item.tax ?? undefined,
    discountAmount: item.discount ?? undefined,
  }
}

export function transformBill(raw: TymsExpense): Bill {
  return {
    id: raw.uuid,
    status: mapStatus(raw),
    contactId: raw.vendor?.uuid || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount ?? undefined,
    taxAmount: extractTaxAmount(raw.tax),
    discountAmount: raw.discount ?? undefined,
    notes: raw.note || undefined,
    lineItems: Array.isArray(raw.items) ? raw.items.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
