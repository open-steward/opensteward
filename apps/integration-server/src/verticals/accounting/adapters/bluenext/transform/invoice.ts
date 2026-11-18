import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BluenextLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  vatAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface BluenextInvoice {
  id: string
  documentNumber: string
  documentDate: string
  expiryDate: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  openAmount: number
  documentStatus: string
  currency: string
  customerId: string
  lines?: BluenextLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'confirmed': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: BluenextLineItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
    taxAmount: row.vatAmount,
  }
}

export function transformInvoice(raw: BluenextInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.documentStatus),
    invoiceNumber: raw.documentNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.expiryDate ? new Date(raw.expiryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
