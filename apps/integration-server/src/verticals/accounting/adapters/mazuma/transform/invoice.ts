import type { Invoice } from '../../../schema/invoice'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface MazumaInvoiceLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface MazumaInvoice {
  id: string
  invoice_number?: string
  contact_id?: string
  status?: string
  currency?: string
  tax_amount?: number
  total_amount?: number
  amount_due?: number
  amount_paid?: number
  invoice_date?: string
  due_date?: string
  line_items?: MazumaInvoiceLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): Invoice['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'sent':
    case 'authorized': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'overdue': return 'OVERDUE'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: return 'unknown'
  }
}

export function transformInvoice(raw: MazumaInvoice): Invoice {
  return {
    id: String(raw.id),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.status),
    currency: raw.currency || 'GBP',
    taxAmount: parseDecimal(raw.tax_amount),
    totalAmount: parseDecimal(raw.total_amount),
    balanceAmount: parseDecimal(raw.amount_due),
    paidAmount: parseDecimal(raw.amount_paid),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    lineItems: nonempty(
      (raw.line_items ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        itemDescription: li.description || undefined,
        unitQuantity: li.quantity,
        unitAmount: parseDecimal(li.unit_price),
        totalAmount: parseDecimal(li.amount),
        taxAmount: parseDecimal(li.tax_amount),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}
