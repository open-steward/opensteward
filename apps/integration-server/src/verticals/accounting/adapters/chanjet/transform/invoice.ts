import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ChanjetInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface ChanjetInvoice {
  invoiceId?: string
  invoiceNo?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  invoiceStatus?: number | string
  customerId?: string
  currencyCode?: string
  lines?: ChanjetInvoiceLine[]
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

export function transformInvoice(raw: ChanjetInvoice): Invoice {
  return {
    id: raw.invoiceId ? String(raw.invoiceId) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.invoiceStatus),
    invoiceNumber: raw.invoiceNo || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
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
