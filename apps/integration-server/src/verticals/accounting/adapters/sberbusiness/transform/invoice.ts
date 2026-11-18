import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SberbusinessInvoiceLine {
  lineId?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface SberbusinessInvoice {
  invoiceId?: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  vatAmount?: number
  status?: string
  clientId?: string
  currencyCode?: string
  lines?: SberbusinessInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): InvoiceStatus {
  switch (s) {
    case 'PAID': return 'PAID'
    case 'CREATED': return 'AUTHORIZED'
    case 'SENT': return 'AUTHORIZED'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: SberbusinessInvoice): Invoice {
  return {
    id: raw.invoiceId ? String(raw.invoiceId) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.lineId ? String(l.lineId) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
