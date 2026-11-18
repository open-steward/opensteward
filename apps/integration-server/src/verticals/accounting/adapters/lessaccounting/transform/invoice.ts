import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface LessAccountingInvoiceItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax: number
  account_id: string
  [key: string]: unknown
}

export interface LessAccountingInvoice {
  id: string
  invoice_number: string
  contact_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  items: LessAccountingInvoiceItem[]
  date: string
  due_date: string
  status: string
  paid_amount: number
  [key: string]: unknown
}

function mapStatus(inv: LessAccountingInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase()
  if (s === 'void') return 'VOIDED'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'sent') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitem(row: LessAccountingInvoiceItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformInvoice(raw: LessAccountingInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount ?? undefined,
    // Policy: don't coerce missing paid → 0; only compute balance when BOTH operands present.
    balanceAmount:
      raw.total_amount != null && raw.paid_amount != null
        ? raw.total_amount - raw.paid_amount
        : undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
