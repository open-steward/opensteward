import { toCalendarDate } from '../../shared/transform'
/**
 * Misoca (Yayoi) invoice transform.
 *
 * Misoca invoice fields (snake_case, from /api/v3/invoices and /api/v3/invoice/{id}):
 *   id, invoice_number, subject, issue_date, payment_due_on, total_amount, tax_amount,
 *   body, contact_id, invoice_status, payment_status, items[]
 *
 * invoice_status: "unsubmitted" | "submitted" | "trashed"
 * payment_status: "unpaid" | "paid"
 *
 * Docs: https://doc.misoca.jp/v3/
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MisocaItem {
  id?: number
  name?: string
  quantity?: number
  unit_price?: number
  unit?: string
  tax_type?: string
  price?: number
  [key: string]: unknown
}

export interface MisocaInvoice {
  id: number
  invoice_number?: string
  subject?: string
  issue_date?: string
  payment_due_on?: string
  total_amount?: number
  tax_amount?: number
  body?: string
  contact_id?: number
  invoice_status?: string
  payment_status?: string
  created_at?: string
  updated_at?: string
  items?: MisocaItem[]
  [key: string]: unknown
}

function mapStatus(raw: MisocaInvoice): InvoiceStatus {
  if (raw.invoice_status === 'trashed') return 'DELETED'
  if (raw.payment_status === 'paid') return 'PAID'
  if (raw.invoice_status === 'submitted') return 'AUTHORIZED'
  if (raw.payment_due_on && new Date(raw.payment_due_on).getTime() < Date.now()) return 'OVERDUE'
  return 'DRAFT'
}

function mapLineitems(items: MisocaItem[] | undefined): Lineitem[] | undefined {
  if (!items?.length) return undefined
  return items.map((item) => ({
    id: item.id != null ? String(item.id) : undefined,
    itemName: item.name || undefined,
    itemDescription: item.name || undefined,
    unitAmount: item.unit_price != null ? item.unit_price : undefined,
    unitQuantity: item.quantity != null ? item.quantity : undefined,
    totalAmount: item.price != null ? item.price : undefined,
  }))
}

export function transformInvoice(raw: MisocaInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    notes: raw.subject || undefined,
    lineItems: mapLineitems(raw.items),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_due_on ? new Date(raw.payment_due_on) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    contact_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    invoice_number: invoice.invoiceNumber,
    subject: invoice.notes,
    issue_date: toCalendarDate(invoice.postedAt),
    payment_due_on: toCalendarDate(invoice.dueAt),
    items: invoice.lineItems?.map((li) => ({
      name: li.itemName ?? li.itemDescription,
      quantity: li.unitQuantity ?? 1,
      unit_price: li.unitAmount,
    })),
  }
}
