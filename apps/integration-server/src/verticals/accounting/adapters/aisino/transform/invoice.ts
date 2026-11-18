import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AisinoInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface AisinoInvoice {
  invoiceId?: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  status?: number | string
  buyerId?: string
  currency?: string
  lines?: AisinoInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): InvoiceStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    case '0': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: AisinoInvoice): Invoice {
  return {
    id: raw.invoiceId ? String(raw.invoiceId) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.buyerId ? String(raw.buyerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
