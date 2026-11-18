import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MaxioInvoiceLineItem {
  uid: string
  title: string
  description: string
  quantity: string
  unit_price: string
  subtotal_amount: string
  tax_amount: string
  [key: string]: unknown
}

export interface MaxioInvoice {
  uid: string
  number: string
  sequence_number: number
  state: string
  created_at: string
  due_date: string
  paid_date: string | null
  currency: string
  total_amount: string
  tax_amount: string
  paid_amount: string
  due_amount: string
  customer_id: number
  subscription_id: number | null
  line_items: MaxioInvoiceLineItem[]
  [key: string]: unknown
}

function mapStatus(state: string): InvoiceStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    case 'canceled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MaxioInvoiceLineItem): Lineitem {
  return {
    id: line.uid,
    itemDescription: line.title || line.description || undefined,
    unitAmount: parseFloat(line.unit_price) || 0,
    unitQuantity: parseFloat(line.quantity) || 1,
    totalAmount: parseFloat(line.subtotal_amount) || 0,
    taxAmount: parseFloat(line.tax_amount) || undefined,
  }
}

export function transformInvoice(raw: MaxioInvoice): Invoice {
  return {
    id: raw.uid,
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_amount) || 0,
    taxAmount: parseFloat(raw.tax_amount) || undefined,
    paidAmount: parseFloat(raw.paid_amount) || undefined,
    balanceAmount: parseFloat(raw.due_amount) || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(data: Partial<Invoice>): Record<string, unknown> {
  return {
    customer_id: data.contactId ? parseInt(data.contactId, 10) : undefined,
    currency: data.currency,
    issue_date: toCalendarDate(data.postedAt),
    due_date: toCalendarDate(data.dueAt),
    line_items: data.lineItems?.map((li) => ({
      title: li.itemDescription,
      quantity: li.unitQuantity,
      unit_price: li.unitAmount,
    })),
  }
}
