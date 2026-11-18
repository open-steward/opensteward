/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface Sage50DeInvoiceLineItem {
  description?: string
  quantity?: number
  unit_price?: number
  tax_amount?: number
  net_amount?: number
  total_amount?: number
  [key: string]: unknown
}

export interface Sage50DeInvoice {
  id: string
  displayed_as?: string
  date?: string
  due_date?: string
  net_amount?: number
  tax_amount?: number
  total_amount?: number
  outstanding_amount?: number
  status?: string
  currency?: { id?: string }
  contact?: { id?: string; displayed_as?: string }
  invoice_lines?: Sage50DeInvoiceLineItem[]
  [key: string]: unknown
}

function toInvoiceStatus(status: string | undefined): InvoiceStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT'
    case 'OPEN': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOID': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: Sage50DeInvoice): Invoice {
  const lineItems: Lineitem[] = (raw.invoice_lines ?? []).map((item) => ({
    itemDescription: item.description,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.total_amount,
  }))

  return {
    id: String(raw.id),
    type: 'INVOICE' as const,
    invoiceNumber: raw.displayed_as,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.outstanding_amount,
    status: toInvoiceStatus(raw.status),
    currency: raw.currency?.id,
    contactId: raw.contact?.id,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
