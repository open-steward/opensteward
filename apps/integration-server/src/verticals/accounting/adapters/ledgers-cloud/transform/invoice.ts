import { toCalendarDate } from '../../shared/transform'
/**
 * LEDGERS.Cloud invoice transform.
 *
 * Endpoints:
 *   GET  /v3/invoice/{id}        — view single invoice
 *   GET  /v3/list-invoice        — paginated list (page_number, page_size, filter.*)
 *   POST /v3/add-invoice         — create
 *
 * Key wire fields (snake_case):
 *   id, invoice_number, invoice_date, validity_date (due date),
 *   contact.id / contact_id, billings_currency, payment_status,
 *   total_amount, paid_amount, balance_amount, tax_amount,
 *   discount_amount, notes, items[]
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface LedgersInvoiceItem {
  id?: string | number
  item_id?: string | number
  name?: string
  description?: string
  unit_price?: number
  quantity?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface LedgersInvoiceContact {
  id?: string | number
  contact_id?: string | number
  contact_name?: string
  [key: string]: unknown
}

export interface LedgersInvoice {
  id?: string | number
  invoice_number?: string
  invoice_date?: string
  validity_date?: string        // due date
  created_at?: string
  updated_at?: string
  contact?: LedgersInvoiceContact
  contact_id?: string | number
  billings_currency?: string
  currency?: string
  payment_status?: string       // "Paid" | "Part Paid" | "Not Paid"
  invoice_status?: string       // "Active" | "Deleted"
  total_amount?: number
  paid_amount?: number
  balance_amount?: number
  tax_amount?: number
  discount_amount?: number
  notes?: string
  items?: LedgersInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: LedgersInvoice): InvoiceStatus {
  const ps = (raw.payment_status ?? '').toLowerCase()
  if (ps === 'paid') return 'PAID'
  if (ps === 'part paid' || ps === 'partially paid') return 'PARTIALLY_PAID'
  if (raw.validity_date && new Date(raw.validity_date).getTime() < Date.now()) {
    return 'OVERDUE'
  }
  return 'AUTHORIZED'
}

function mapLines(items: LedgersInvoiceItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    id: it.id != null ? String(it.id) : undefined,
    itemId: it.item_id != null ? String(it.item_id) : undefined,
    itemName: it.name || undefined,
    itemDescription: it.description || undefined,
    accountId: it.account_id != null ? String(it.account_id) : undefined,
    unitAmount: it.unit_price,
    unitQuantity: it.quantity != null ? Math.round(it.quantity) : undefined,
    taxAmount: it.tax_amount,
    totalAmount: it.amount,
  }))
}

export function transformInvoice(raw: LedgersInvoice): Invoice {
  const contactId =
    raw.contact?.id ??
    raw.contact?.contact_id ??
    raw.contact_id
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: contactId != null ? String(contactId) : undefined,
    currency: raw.billings_currency || raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    discountAmount: raw.discount_amount,
    paidAmount: raw.paid_amount,
    balanceAmount: raw.balance_amount,
    notes: raw.notes || undefined,
    lineItems: raw.items ? mapLines(raw.items) : undefined,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.validity_date ? new Date(raw.validity_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    invoice_number: invoice.invoiceNumber,
    invoice_date: toCalendarDate(invoice.postedAt),
    validity_date: toCalendarDate(invoice.dueAt),
    contact: invoice.contactId ? { id: invoice.contactId } : undefined,
    billings_currency: invoice.currency,
    notes: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      item_id: li.itemId,
      name: li.itemName,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      amount: li.totalAmount,
    })),
  }
}
